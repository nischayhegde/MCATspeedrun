# Copyright: Ankitects Pty Ltd and contributors
# License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

"""LAN API server for the mobile MCAT client ("phone access").

Runs a second waitress listener on 0.0.0.0 serving the same Flask app as the
local media server, gated by a bearer token that only unlocks the MCAT RPCs
and media-file GETs. The token is displayed to the user (QR/pairing code), so
it must never grant access to the rest of the API.
"""

from __future__ import annotations

import logging
import secrets
import socket
import threading

from waitress.server import create_server

logger = logging.getLogger(__name__)

DEFAULT_LAN_PORT = 8045
TOKEN_PROFILE_KEY = "mcatLanServerToken"

# POST /_anki/<method> handlers the LAN token may call.
ALLOWED_LAN_METHODS = frozenset(
    {
        "computeMcatReadiness",
        "recomputeMcatLeafStates",
        "getMcatStudyQueue",
        "answerMcatCard",
        "answerMcatCardTyped",
        "getMcatDiagnostic",
        "resetMcatProgress",
    }
)

_API_PREFIX = "_anki/"


def lan_request_allowed(method: str, path: str) -> bool:
    """Policy for requests authenticated with the LAN token.

    `path` is the request path without the leading slash, as passed to
    mediasrv's handle_request.
    """
    if method == "POST":
        return path.startswith(_API_PREFIX) and (
            path[len(_API_PREFIX) :] in ALLOWED_LAN_METHODS
        )
    if method == "GET":
        # Coarse filter only: media files are served from the root path, but
        # mediasrv aliases sveltekit pages (mcat/, graphs/, _app/, ...) to
        # internal bundle paths AFTER this check, so the authoritative
        # media-only rule lives in mediasrv's handle_request (it denies any
        # LAN GET that does not resolve to a collection-media file).
        return not path.startswith(("_anki/", "_addons/", "_app/"))
    return False


def token_matches(header_value: str | None, token: str | None) -> bool:
    if not header_value or not token:
        return False
    return secrets.compare_digest(header_value, f"Bearer {token}")


def get_lan_ip() -> str:
    """Primary LAN IPv4 of this machine (the UDP socket sends no traffic)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


class LanServer(threading.Thread):
    """A waitress listener on all interfaces, stoppable from another thread."""

    daemon = True

    def __init__(self, app, port: int = DEFAULT_LAN_PORT) -> None:
        super().__init__(name="mcat-lan-server")
        self._app = app
        self._port = port
        self._ready = threading.Event()
        self._error: str | None = None
        self.is_shutdown = False
        self.server = None

    def start_and_wait(self) -> str | None:
        "Start the thread and block until listening; error message or None."
        self.start()
        self._ready.wait(timeout=10)
        return self._error

    @property
    def effective_port(self) -> int:
        return int(self.server.effective_port)  # type: ignore[union-attr]

    def run(self) -> None:
        # Tag every request served by this listener so the access policy can
        # deny tokenless LAN requests outright. Without the tag they would fall
        # through to the localhost Host/Origin allowance, which a LAN client can
        # pass by spoofing Host: 127.0.0.1 — the two listeners share one app.
        def tagged_app(environ, start_response):
            environ["mcat.lan_listener"] = True
            return self._app(environ, start_response)

        try:
            self.server = create_server(
                tagged_app,
                host="0.0.0.0",
                port=self._port,
                clear_untrusted_proxy_headers=True,
            )
        except OSError as exc:
            self._error = str(exc)
            self._ready.set()
            return
        logger.info("MCAT LAN server listening on 0.0.0.0:%d", self.effective_port)
        self._ready.set()
        try:
            self.server.run()
        except Exception:
            if not self.is_shutdown:
                raise

    def shutdown(self) -> None:
        self.is_shutdown = True
        if not self.server:
            return
        for sock in list(self.server._map.values()):  # type: ignore[attr-defined]
            sock.handle_close()
        self.server.task_dispatcher.shutdown()


_lock = threading.Lock()
_current: LanServer | None = None
_current_token: str | None = None


def start(app, token: str, port: int = DEFAULT_LAN_PORT) -> str | None:
    "Start the singleton LAN server; error message, or None on success/no-op."
    global _current, _current_token
    with _lock:
        if _current:
            return None
        server = LanServer(app, port=port)
        error = server.start_and_wait()
        if error:
            return error
        _current = server
        _current_token = token
        return None


def stop() -> None:
    global _current, _current_token
    with _lock:
        if _current:
            _current.shutdown()
        _current = None
        _current_token = None


def is_running() -> bool:
    with _lock:
        return _current is not None


def has_lan_access(auth_header: str | None) -> bool:
    "True iff the header carries the active LAN token."
    with _lock:
        token = _current_token if _current else None
    return token_matches(auth_header, token)
