# MCAT Mobile (Expo) + Desktop LAN Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone (Expo Go / React Native) frontend for the MCAT dashboard/study/diagnostic flows, talking to the desktop app's existing Rust backend over Wi-Fi via a token-authenticated LAN listener started from a button on the desktop MCAT dashboard.

**Architecture:** The desktop already serves the whole backend as `POST /_anki/{camelCaseMethod}` with binary-protobuf bodies (Flask/waitress "mediasrv", `qt/aqt/mediasrv.py`). We add a second waitress listener on `0.0.0.0:8045` serving the _same_ Flask app, gated by a bearer token that only unlocks the 7 MCAT RPCs + media-file GETs. The phone app is a fresh standalone Expo project that generates protobuf classes from the same `proto/` dir and calls the same endpoints.

**Tech Stack:** Desktop: Python (Flask/waitress), protobuf (`frontend.proto`), Svelte 4-style components, `qrcode` npm package. Mobile: Expo (latest SDK, Expo Go-compatible), TypeScript, Expo Router, `@bufbuild/protobuf` v2 + `protoc-gen-es`, `expo-camera`, AsyncStorage, jest.

Spec: `docs/superpowers/specs/2026-07-03-mcat-mobile-lan-design.md`

## Global Constraints

- **Expo Go only**: no custom native modules; only pure-JS deps and Expo Go built-ins (`expo-camera`, `@react-native-async-storage/async-storage`).
- **LAN port is fixed at 8045**; token profile key is `mcatLanServerToken`; QR/pairing payload is JSON `{"v": 1, "host": "<ip>", "port": 8045, "token": "<token>"}`.
- **LAN token allowlist is exactly**: POST `computeMcatReadiness`, `recomputeMcatLeafStates`, `getMcatStudyQueue`, `answerMcatCard`, `answerMcatCardTyped`, `getMcatDiagnostic`, `resetMcatProgress`, plus GET of media files (root-path files, not `_anki/` or `_addons/`). Everything else → 403.
- **Do not touch** the `ANKI_API_HOST=0.0.0.0` env mode, the per-launch `_APIKEY` desktop-webview auth, or the localhost Host/Origin checks for non-LAN requests.
- The desktop repo is `C:\AlphaAI\wk1to3\MCATspeedrun`; the mobile app is a **separate project + git repo** at `C:\AlphaAI\wk1to3\mcat-mobile`.
- Mobile app is a thin client: no offline caching, no editing, no sync.
- Desktop repo lint: eslint runs `--max-warnings=0` (warnings fail); python is mypy/ruff-checked; run checks via the ninja targets below.

### Desktop repo build/test commands (Windows, PowerShell)

The harness shell may have a stale PATH where `cargo`/`just` don't resolve. Prepend once per shell:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

From the repo root `C:\AlphaAI\wk1to3\MCATspeedrun`:

- Build pylib + qt (incl. proto codegen): `tools\ninja pylib qt`
- Python tests: `tools\ninja check:pytest:aqt`
  - Fast direct iteration: `$env:PYTHONPATH="pylib;out\pylib;out\qt;out\qt\tools"; out\pyenv\Scripts\python.exe -m pytest qt\tests\test_lan_server.py -v`
- Web/TS gate: `tools\ninja qt check:svelte check:typescript check:eslint check:format check:vitest`
- Format fixes: `tools\ninja format` (dprint) — run if check:format fails
- Full gate before finishing desktop work: `.\check` (equivalent of `just check`)
- Run the app: `.\run.bat` (serves web on http://127.0.0.1:40000, uses seeded profile `out\mcat_base`)
- **Never clean `out\`**. If someone did: recreate the junction (`Remove-Item out\node_modules -Recurse -Force; New-Item -ItemType Junction -Path out\node_modules -Target C:\AlphaAI\wk1to3\MCATspeedrun\node_modules`) and reseed the profile (`out\pyenv\Scripts\python.exe -m mcat_tools.seed_profile out\mcat_base`).

## File Structure

Desktop (`C:\AlphaAI\wk1to3\MCATspeedrun`):

- Modify: `proto/anki/frontend.proto` — `LanServerStatus` message + 3 `FrontendService` RPCs (the build generates the TS wrappers in `out/ts/lib/generated/backend.ts` and Python classes in `out/pylib/anki/frontend_pb2.*`)
- Create: `qt/aqt/lan_server.py` — LAN listener lifecycle + auth/allowlist policy (no imports from mediasrv; the Flask app is passed in)
- Modify: `qt/aqt/mediasrv.py` — LAN gate in `handle_request` + `_check_dynamic_request_permissions`, and 3 post handlers
- Create: `qt/tests/test_lan_server.py` — policy + lifecycle + gate tests
- Create: `ts/routes/mcat/lib/LanServerModal.svelte` — modal with IP:port, QR, pairing-code copy, stop button
- Modify: `ts/routes/mcat/McatDashboard.svelte` — "Phone access" button + modal mount
- Modify: `package.json` (repo root) — add `qrcode` + `@types/qrcode`

Mobile (`C:\AlphaAI\wk1to3\mcat-mobile`, new):

- `buf.gen.yaml` + `src/gen/**` (generated protobuf, committed)
- `src/api/pairing.ts` — pairing payload parse/validate, `ServerConfig` type
- `src/api/storage.ts` — AsyncStorage load/save/clear of `ServerConfig`
- `src/api/client.ts` — `callBackend` + 7 typed RPC wrappers
- `src/api/ConnectionContext.tsx` — React context: config + setters, loaded on boot
- `app/_layout.tsx`, `app/index.tsx` (dashboard), `app/pair.tsx`, `app/study.tsx`, `app/diagnostic.tsx`
- `src/components/` — `McqCard.tsx`, `TypedFlashcard.tsx`, `MeterBar.tsx`, `ErrorBanner.tsx`
- `__tests__/pairing.test.ts`, `__tests__/client.test.ts`

---

### Task 1: Proto contract — `LanServerStatus` + FrontendService RPCs

**Files:**

- Modify: `proto/anki/frontend.proto`

**Interfaces:**

- Produces: `FrontendService` RPCs `StartLanServer`, `StopLanServer`, `GetLanServerStatus` (all `generic.Empty` → `LanServerStatus`). After the build, TS gets `startLanServer/stopLanServer/getLanServerStatus` in `@generated/backend` returning `LanServerStatus { running: boolean; hostIp: string; port: number; token: string; error: string }` (from `@generated/anki/frontend_pb`), and Python gets `anki.frontend_pb2.LanServerStatus`. Tasks 3 and 4 rely on these exact names.

- [ ] **Step 1: Add the RPCs and message**

In `proto/anki/frontend.proto`, inside `service FrontendService` (after the `SaveCustomColours` rpc, line 32), add:

```proto
// Start the MCAT LAN API server (phone access); returns connection info.
rpc StartLanServer(generic.Empty) returns (LanServerStatus);
// Stop the MCAT LAN API server.
rpc StopLanServer(generic.Empty) returns (LanServerStatus);
// Current LAN server state, without changing it.
rpc GetLanServerStatus(generic.Empty) returns (LanServerStatus);
```

At the bottom of the file (after `SetSchedulingStatesRequest`), add:

```proto
message LanServerStatus {
  bool running = 1;
  // Primary LAN IPv4 of this machine, e.g. "192.168.1.23".
  string host_ip = 2;
  uint32 port = 3;
  // Bearer token the phone must present. Generated once, kept per profile.
  string token = 4;
  // Non-empty when starting failed (e.g. port already in use).
  string error = 5;
}
```

- [ ] **Step 2: Build to regenerate bindings**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
tools\ninja pylib qt
```

Expected: build succeeds.

- [ ] **Step 3: Verify generated code exists**

```powershell
Select-String -Path out\ts\lib\generated\backend.ts -Pattern "startLanServer|LanServerStatus" | Select-Object -First 4
Select-String -Path out\pylib\anki\frontend_pb2.pyi -Pattern "LanServerStatus"
```

Expected: `startLanServer(...)` wrapper and `LanServerStatus` hits in both.

- [ ] **Step 4: Commit**

```powershell
git add proto/anki/frontend.proto
git commit -m "feat(proto): LAN server status/control RPCs for phone access"
```

---

### Task 2: `lan_server.py` — policy functions and listener lifecycle

**Files:**

- Create: `qt/aqt/lan_server.py`
- Test: `qt/tests/test_lan_server.py`

**Interfaces:**

- Consumes: nothing from other tasks (deliberately does not import `aqt.mediasrv`; the Flask app is passed as an argument).
- Produces (used by Task 3):
  - `DEFAULT_LAN_PORT: int = 8045`, `TOKEN_PROFILE_KEY: str = "mcatLanServerToken"`
  - `lan_request_allowed(method: str, path: str) -> bool` — `path` has no leading slash (as in mediasrv's `handle_request`)
  - `has_lan_access(auth_header: str | None) -> bool` — True iff header equals `Bearer <active token>` and the server is running
  - `start(app, token: str, port: int = DEFAULT_LAN_PORT) -> str | None` — starts singleton listener; returns error string or None; no-op (None) if already running
  - `stop() -> None`, `is_running() -> bool`
  - `get_lan_ip() -> str`
  - class `LanServer(threading.Thread)` with `start_and_wait() -> str | None`, `shutdown()`, and `effective_port` after ready (used only by tests)

- [ ] **Step 1: Write the failing tests**

Create `qt/tests/test_lan_server.py`:

```python
# Copyright: Ankitects Pty Ltd and contributors
# License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

"""Tests for the MCAT LAN API server (phone access)."""

from __future__ import annotations

import socket
import urllib.request

import pytest

from aqt.lan_server import (
    DEFAULT_LAN_PORT,
    LanServer,
    get_lan_ip,
    lan_request_allowed,
    token_matches,
)

MCAT_METHODS = [
    "computeMcatReadiness",
    "recomputeMcatLeafStates",
    "getMcatStudyQueue",
    "answerMcatCard",
    "answerMcatCardTyped",
    "getMcatDiagnostic",
    "resetMcatProgress",
]


class TestLanRequestAllowed:
    @pytest.mark.parametrize("method", MCAT_METHODS)
    def test_mcat_posts_allowed(self, method: str) -> None:
        assert lan_request_allowed("POST", f"_anki/{method}") is True

    @pytest.mark.parametrize(
        "path",
        [
            "_anki/getDeckNames",
            "_anki/updateDeckConfigs",
            "_anki/importJsonFile",
            "_anki/i18nResources",
            "_anki/legacyPageData",
        ],
    )
    def test_other_api_posts_denied(self, path: str) -> None:
        assert lan_request_allowed("POST", path) is False

    def test_media_get_allowed(self) -> None:
        assert lan_request_allowed("GET", "paste-abc123.jpg") is True

    def test_nested_media_get_allowed(self) -> None:
        # media filenames never contain '/', but the policy must still be safe
        assert lan_request_allowed("GET", "sub/file.jpg") is True

    @pytest.mark.parametrize(
        "path",
        [
            "_anki/pages/mcat",
            "_anki/legacyPageData",
            "_addons/addon/code.js",
            "_app/immutable/entry.js",
        ],
    )
    def test_internal_gets_denied(self, path: str) -> None:
        assert lan_request_allowed("GET", path) is False

    def test_post_to_media_path_denied(self) -> None:
        assert lan_request_allowed("POST", "foo.jpg") is False

    def test_other_verbs_denied(self) -> None:
        assert lan_request_allowed("PUT", "_anki/answerMcatCard") is False


class TestTokenMatches:
    def test_exact_match(self) -> None:
        assert token_matches("Bearer abc123", "abc123") is True

    def test_wrong_token(self) -> None:
        assert token_matches("Bearer abc123", "def456") is False

    def test_missing_bearer_prefix(self) -> None:
        assert token_matches("abc123", "abc123") is False

    def test_none_header(self) -> None:
        assert token_matches(None, "abc123") is False

    def test_none_token(self) -> None:
        assert token_matches("Bearer abc123", None) is False

    def test_empty_both(self) -> None:
        assert token_matches("", "") is False


def test_get_lan_ip_returns_ipv4() -> None:
    ip = get_lan_ip()
    socket.inet_aton(ip)  # raises if not dotted-quad


def _dummy_app(environ, start_response):
    start_response("200 OK", [("Content-Type", "text/plain")])
    return [b"ok"]


class TestLanServerLifecycle:
    def test_default_port_constant(self) -> None:
        assert DEFAULT_LAN_PORT == 8045

    def test_start_serve_shutdown(self) -> None:
        server = LanServer(_dummy_app, port=0)  # 0 = ephemeral for the test
        error = server.start_and_wait()
        assert error is None
        port = server.effective_port
        body = urllib.request.urlopen(
            f"http://127.0.0.1:{port}/anything", timeout=5
        ).read()
        assert body == b"ok"
        server.shutdown()
        server.join(timeout=5)
        assert not server.is_alive()

    def test_port_in_use_reports_error(self) -> None:
        blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        blocker.bind(("0.0.0.0", 0))
        blocker.listen(1)
        port = blocker.getsockname()[1]
        try:
            server = LanServer(_dummy_app, port=port)
            error = server.start_and_wait()
            assert error is not None and error != ""
        finally:
            blocker.close()
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
$env:PYTHONPATH="pylib;out\pylib;out\qt;out\qt\tools"; out\pyenv\Scripts\python.exe -m pytest qt\tests\test_lan_server.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'aqt.lan_server'`.

- [ ] **Step 3: Write the implementation**

Create `qt/aqt/lan_server.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
$env:PYTHONPATH="pylib;out\pylib;out\qt;out\qt\tools"; out\pyenv\Scripts\python.exe -m pytest qt\tests\test_lan_server.py -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add qt/aqt/lan_server.py qt/tests/test_lan_server.py
git commit -m "feat: LAN server module with token + MCAT allowlist policy"
```

---

### Task 3: mediasrv integration — auth gate + start/stop/status handlers

**Files:**

- Modify: `qt/aqt/mediasrv.py` (gate at `handle_request` ~line 381; permissions at `_check_dynamic_request_permissions` ~line 820; handlers + `post_handler_list` ~line 708)
- Test: `qt/tests/test_lan_server.py` (extend)

**Interfaces:**

- Consumes: everything in Task 2's Produces block, plus Task 1's `anki.frontend_pb2.LanServerStatus`.
- Produces: HTTP handlers `startLanServer`, `stopLanServer`, `getLanServerStatus` callable by the desktop webview (Task 4 calls them via `@generated/backend`). LAN behavior contract used by Tasks 5–13: valid `Authorization: Bearer <lan token>` ⇒ allowlisted request proceeds, all other requests 403.

- [ ] **Step 1: Write the failing tests**

Append to `qt/tests/test_lan_server.py`:

```python
import aqt
from aqt import lan_server


class _StubTaskman:
    def run_on_main(self, closure):
        closure()


class _StubPm:
    def __init__(self) -> None:
        self.profile: dict = {}

    def save(self) -> None:
        pass


class _StubMw:
    def __init__(self) -> None:
        self.taskman = _StubTaskman()
        self.pm = _StubPm()
        self.col = None


@pytest.fixture
def lan_active(monkeypatch):
    "Simulate a running LAN server with a known token, plus a stub mw."
    monkeypatch.setattr(lan_server, "_current", object())
    monkeypatch.setattr(lan_server, "_current_token", "testtoken")
    monkeypatch.setattr(aqt, "mw", _StubMw())
    yield "Bearer testtoken"


class TestLanGate:
    def _client(self):
        from aqt.mediasrv import app

        return app.test_client()

    def test_lan_token_denied_for_non_mcat_method(self, lan_active) -> None:
        resp = self._client().post(
            "/_anki/getDeckNames",
            headers={
                "Authorization": lan_active,
                "Content-Type": "application/binary",
            },
        )
        assert resp.status_code == 403

    def test_lan_token_passes_gate_for_mcat_method(self, lan_active) -> None:
        # col is None in tests, so a request that passes the auth gate hits
        # "collection not open" (404) rather than 403.
        resp = self._client().post(
            "/_anki/computeMcatReadiness",
            headers={
                "Authorization": lan_active,
                "Content-Type": "application/binary",
            },
        )
        assert resp.status_code == 404

    def test_no_token_from_lan_host_denied(self, lan_active) -> None:
        resp = self._client().post(
            "/_anki/computeMcatReadiness",
            headers={
                "Host": "192.168.1.50:8045",
                "Content-Type": "application/binary",
            },
        )
        assert resp.status_code == 403

    def test_wrong_token_from_lan_host_denied(self, lan_active) -> None:
        resp = self._client().post(
            "/_anki/computeMcatReadiness",
            headers={
                "Host": "192.168.1.50:8045",
                "Authorization": "Bearer wrong",
                "Content-Type": "application/binary",
            },
        )
        assert resp.status_code == 403

    def test_media_get_with_token_passes_gate(self, lan_active) -> None:
        # Passes the gate; col is None so it 404s at "collection not open".
        resp = self._client().get(
            "/some-image.jpg",
            headers={"Host": "192.168.1.50:8045", "Authorization": lan_active},
        )
        assert resp.status_code == 404

    def test_media_get_without_token_denied(self, lan_active) -> None:
        resp = self._client().get(
            "/some-image.jpg", headers={"Host": "192.168.1.50:8045"}
        )
        assert resp.status_code == 403

    def test_sveltekit_alias_get_denied(self, lan_active) -> None:
        # "mcat/..." is aliased to internal bundle content during request
        # extraction; a LAN token must not fetch it even though the raw
        # path looks media-like.
        resp = self._client().get(
            "/mcat/_app/immutable/chunks/foo.js",
            headers={"Host": "192.168.1.50:8045", "Authorization": lan_active},
        )
        assert resp.status_code == 403

    def test_graphs_page_get_denied(self, lan_active) -> None:
        resp = self._client().get(
            "/graphs/index.html",
            headers={"Host": "192.168.1.50:8045", "Authorization": lan_active},
        )
        assert resp.status_code == 403

    def test_localhost_requests_unaffected(self, lan_active) -> None:
        # No LAN token: existing localhost rules still apply (page 404s
        # normally rather than 403).
        resp = self._client().get(
            "/_anki/pages/nonexistent", headers={"Host": "127.0.0.1:40000"}
        )
        assert resp.status_code == 404

    def test_favicon_from_lan_without_token_denied(self, lan_active) -> None:
        # /favicon.ico is its own Flask route; the before_request hook must
        # still gate it so the LAN listener has no ungated endpoints.
        resp = self._client().get(
            "/favicon.ico", headers={"Host": "192.168.1.50:8045"}
        )
        assert resp.status_code == 403

    def test_favicon_from_localhost_allowed(self, lan_active) -> None:
        resp = self._client().get(
            "/favicon.ico", headers={"Host": "127.0.0.1:40000"}
        )
        assert resp.status_code != 403

    def test_favicon_from_lan_with_token_denied(self, lan_active) -> None:
        # Even a paired device may only reach the handle_request endpoint;
        # the standalone favicon route serves no collection media, so a valid
        # token must not unlock it.
        resp = self._client().get(
            "/favicon.ico",
            headers={"Host": "192.168.1.50:8045", "Authorization": lan_active},
        )
        assert resp.status_code == 403


class _StubBackend:
    def __init__(self) -> None:
        self.called_with: bytes | None = None

    def compute_mcat_readiness_raw(self, data: bytes) -> bytes:
        self.called_with = data
        return b"\x08\x01"  # arbitrary non-empty protobuf-ish bytes


class _StubCol:
    def __init__(self) -> None:
        self._backend = _StubBackend()


class TestLanFineGrainedGrant:
    """The MCAT RPCs must survive _check_dynamic_request_permissions, whose
    new LAN branch grants access. With col=None the request 404s before that
    check runs, so a truthy stub col is needed to exercise the grant path."""

    @pytest.fixture
    def lan_active_with_col(self, monkeypatch):
        monkeypatch.setattr(lan_server, "_current", object())
        monkeypatch.setattr(lan_server, "_current_token", "testtoken")
        mw = _StubMw()
        mw.col = _StubCol()
        monkeypatch.setattr(aqt, "mw", mw)
        yield "Bearer testtoken"

    def test_mcat_rpc_granted_end_to_end(self, lan_active_with_col) -> None:
        from aqt.mediasrv import app

        resp = app.test_client().post(
            "/_anki/computeMcatReadiness",
            headers={
                "Authorization": lan_active_with_col,
                "Content-Type": "application/binary",
            },
            data=b"",
        )
        assert resp.status_code == 200
        assert resp.data == b"\x08\x01"
```

Note: `_StubMw` (defined earlier in this file) must set `self.col = None` in
`__init__` so the fixture can override it; it already does per Task 3 Step 1.

Note: `test_localhost_requests_unaffected` exercises the pre-existing localhost path; if `/_anki/pages/nonexistent` turns out to short-circuit differently (e.g. 500 because `aqt.mw.col` is None), assert only `!= 403` — the point is that localhost is not blocked by the new gate.

- [ ] **Step 2: Run tests to verify the new ones fail**

```powershell
$env:PYTHONPATH="pylib;out\pylib;out\qt;out\qt\tools"; out\pyenv\Scripts\python.exe -m pytest qt\tests\test_lan_server.py -v -k TestLanGate
```

Expected: FAIL — LAN-token requests currently 403 on the Host check (`test_lan_token_passes_gate_for_mcat_method`, `test_media_get_with_token_passes_gate` get 403, not 404).

- [ ] **Step 3: Implement the mediasrv changes**

In `qt/aqt/mediasrv.py`:

(a) Add the import (after `from aqt.progress import ProgressUpdate`, ~line 39):

```python
from aqt import lan_server
```

(b) The access gate must apply to **every** route, not just the catch-all
`handle_request` — otherwise the standalone `/favicon.ico` route
(`mediasrv.py:189`) serves unauthenticated on the LAN listener. Move the
coarse gate into a `before_request` hook, and keep only the authoritative
post-extraction media rule inside `handle_request`.

Add a `before_request` hook (place it just above `handle_request`, ~line 380):

```python
@app.before_request
def _enforce_access_policy() -> None:
    # Runs for every route (including /favicon.ico), so the LAN listener has
    # no ungated endpoints. handle_request adds the authoritative media-only
    # rule for LAN GETs after request extraction.
    if lan_server.has_lan_access(request.headers.get("Authorization")):
        # phone client on the LAN: restricted to the MCAT API + media files
        if not lan_server.lan_request_allowed(
            request.method, request.path.lstrip("/")
        ):
            logger.warning(
                "denied LAN request: %s %s", request.method, request.path
            )
            abort(403)
        # All legitimate LAN traffic (MCAT RPCs + media) flows through the
        # catch-all handle_request endpoint, which applies the authoritative
        # media-only rule. Standalone routes (favicon, Flask's /static) never
        # serve collection media, so deny them even with a valid token — this
        # keeps handle_request the sole authority and closes routes the coarse
        # filter can't see.
        if request.endpoint != "handle_request":
            logger.warning("denied LAN request to %s route", request.endpoint)
            abort(403)
        return
    # No valid LAN token. A request that arrived on the LAN listener must be
    # denied outright — it must NOT fall through to the localhost Host/Origin
    # allowance below, which a LAN client could pass by spoofing
    # `Host: 127.0.0.1`. Only the 127.0.0.1 listener (no tag) gets that path.
    if request.environ.get("mcat.lan_listener"):
        logger.warning(
            "denied tokenless LAN request: %s %s", request.method, request.path
        )
        abort(403)
    if os.environ.get("ANKI_API_HOST") != "0.0.0.0":
        host = request.headers.get("Host", "").lower()
        origin = request.headers.get("Origin", "").lower()
        allowed_hosts = tuple(f"{h}:" for h in _LOCALHOST_HOSTS)
        if not any(host.startswith(h) for h in allowed_hosts):
            logger.warning("denied non-local host: %s", host)
            abort(403)
        if origin and not is_localhost_origin(origin):
            logger.warning("denied non-local origin: %s", origin)
            abort(403)
```

Then replace the body of `handle_request` (currently the localhost gate at
lines 382–392 plus `req = _extract_request(pathin)`) so the gate is gone and
only the authoritative media check remains:

```python
@app.route("/<path:pathin>", methods=["GET", "POST"])
def handle_request(pathin: str) -> Response:
    req = _extract_request(pathin)
    logger.debug("%s /%s", flask.request.method, pathin)

    # Authoritative LAN media rule (the coarse gate lives in
    # _enforce_access_policy): mediasrv aliases sveltekit pages
    # (mcat/, graphs/, _app/, ...) to internal bundle paths during
    # extraction, so a raw-path filter cannot classify them. Serve LAN GETs
    # only when the request resolved to a collection-media file; NotFound
    # passes through so "collection not open"/missing files still 404.
    if (
        lan_server.has_lan_access(request.headers.get("Authorization"))
        and request.method == "GET"
        and not isinstance(req, NotFound)
        and not (
            isinstance(req, LocalFileRequest)
            and req.root == aqt.mw.col.media.dir()
        )
    ):
        logger.warning("denied LAN GET of non-media path: /%s", pathin)
        abort(403)
```

(the dispatch chain — `try: … isinstance(req, …)` — is unchanged; there must
still be exactly ONE `_extract_request` call)

(c) In `_check_dynamic_request_permissions` (~line 835), after the `if _have_api_access(): return` block, add:

```python
# phone clients authenticated with the LAN token may call the MCAT API
if lan_server.has_lan_access(
    request.headers.get("Authorization")
) and lan_server.lan_request_allowed(request.method, request.path.lstrip("/")):
    return
```

(d) Add the three handlers just above `post_handler_list` (~line 708):

```python
def _lan_status_bytes(error: str = "") -> bytes:
    from anki import frontend_pb2

    return frontend_pb2.LanServerStatus(
        running=lan_server.is_running(),
        host_ip=lan_server.get_lan_ip(),
        port=lan_server.DEFAULT_LAN_PORT,
        token=aqt.mw.pm.profile.get(lan_server.TOKEN_PROFILE_KEY, ""),
        error=error,
    ).SerializeToString()


def start_lan_server() -> bytes:
    token = aqt.mw.pm.profile.get(lan_server.TOKEN_PROFILE_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        aqt.mw.pm.profile[lan_server.TOKEN_PROFILE_KEY] = token
        # profile db writes must happen on the main thread
        aqt.mw.taskman.run_on_main(aqt.mw.pm.save)
    error = lan_server.start(app, token) or ""
    return _lan_status_bytes(error)


def stop_lan_server() -> bytes:
    lan_server.stop()
    return _lan_status_bytes()


def get_lan_server_status() -> bytes:
    return _lan_status_bytes()
```

(e) Add to `post_handler_list`:

```python
start_lan_server,
stop_lan_server,
get_lan_server_status,
```

(`stringcase.camelcase` maps these to `startLanServer` / `stopLanServer` / `getLanServerStatus`, matching the proto RPC names.)

- [ ] **Step 4: Run the full test file**

```powershell
$env:PYTHONPATH="pylib;out\pylib;out\qt;out\qt\tools"; out\pyenv\Scripts\python.exe -m pytest qt\tests\test_lan_server.py qt\tests\test_mediasrv.py -v
```

Expected: all PASS (including the pre-existing mediasrv tests).

- [ ] **Step 5: Run the repo python gate**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
tools\ninja check:pytest:aqt
```

Expected: passes. (This also runs mypy/ruff-adjacent format targets on some setups; if `check:format` complains later, run `tools\ninja format`.)

- [ ] **Step 6: Commit**

```powershell
git add qt/aqt/mediasrv.py qt/tests/test_lan_server.py
git commit -m "feat: expose MCAT API on LAN behind bearer token"
```

---

### Task 4: Desktop UI — "Phone access" button + modal with IP/port/QR

**Files:**

- Modify: `package.json` (repo root — add `qrcode`, `@types/qrcode`)
- Create: `ts/routes/mcat/lib/LanServerModal.svelte`
- Modify: `ts/routes/mcat/McatDashboard.svelte`

**Interfaces:**

- Consumes: `startLanServer`, `stopLanServer` from `@generated/backend`; `LanServerStatus` type from `@generated/anki/frontend_pb` (Task 1); server behavior from Task 3.
- Produces: the pairing QR + copyable pairing code whose JSON payload `{"v":1,"host":...,"port":...,"token":...}` Task 7's parser must accept.

- [ ] **Step 1: Add the qrcode dependency**

```powershell
.\yarn add qrcode @types/qrcode
```

Expected: `package.json` gains both; `yarn.lock` updated.

- [ ] **Step 2: Create the modal component**

Create `ts/routes/mcat/lib/LanServerModal.svelte`:

```svelte
<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import QRCode from "qrcode";

    import type { LanServerStatus } from "@generated/anki/frontend_pb";
    import { startLanServer, stopLanServer } from "@generated/backend";

    const dispatch = createEventDispatcher<{ close: void }>();

    let status: LanServerStatus | null = null;
    let qrDataUrl = "";
    let pairingCode = "";
    let busy = true;
    let copied = false;

    async function apply(s: LanServerStatus): Promise<void> {
        status = s;
        if (s.running && s.token) {
            pairingCode = JSON.stringify({
                v: 1,
                host: s.hostIp,
                port: s.port,
                token: s.token,
            });
            qrDataUrl = await QRCode.toDataURL(pairingCode, {
                width: 240,
                margin: 1,
            });
        } else {
            pairingCode = "";
            qrDataUrl = "";
        }
    }

    onMount(async () => {
        try {
            await apply(await startLanServer({}));
        } finally {
            busy = false;
        }
    });

    async function stop(): Promise<void> {
        busy = true;
        try {
            await apply(await stopLanServer({}));
        } finally {
            busy = false;
        }
        dispatch("close");
    }

    async function copyCode(): Promise<void> {
        try {
            await navigator.clipboard.writeText(pairingCode);
            copied = true;
            setTimeout(() => (copied = false), 1500);
        } catch {
            // clipboard can reject (permissions/non-secure context); the code
            // is still selectable in the input, so fail quietly.
        }
    }

    function onWindowKeydown(e: KeyboardEvent): void {
        // Attached to the window so Escape closes regardless of focus (the
        // trigger button keeps focus and is outside .lan-overlay).
        if (e.key === "Escape") {
            dispatch("close");
        }
    }
</script>

<svelte:window on:keydown={onWindowKeydown} />

<div
    class="lan-overlay"
    role="button"
    tabindex="-1"
    on:click={() => dispatch("close")}
>
    <div
        class="lan-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lan-title"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown|stopPropagation
    >
        <h2 id="lan-title">Phone access</h2>
        {#if busy}
            <p>Starting LAN server…</p>
        {:else if status?.error}
            <p class="error">Couldn't start the server: {status.error}</p>
        {:else if status?.running}
            <p class="address">
                http://{status.hostIp}:{status.port}
            </p>
            {#if qrDataUrl}
                <img class="qr" src={qrDataUrl} alt="Pairing QR code" />
            {/if}
            <p class="hint">
                Scan this QR from the phone app, or copy the pairing code below.
                Anyone with this code can read and answer your MCAT cards while
                the server is running.
            </p>
            <div class="code-row">
                <input readonly value={pairingCode} />
                <button on:click={copyCode}>{copied ? "Copied" : "Copy"}</button>
            </div>
            <p class="hint">
                If the phone can't connect, allow Python/Anki through Windows
                Firewall for private networks (a prompt may have appeared), and
                make sure the phone is on the same Wi-Fi.
            </p>
        {:else}
            <p>Server stopped.</p>
        {/if}
        <div class="lan-actions">
            <button
                class="stop"
                disabled={busy || !status?.running}
                on:click={stop}
            >
                Stop server
            </button>
            <button class="close" on:click={() => dispatch("close")}>
                Close
            </button>
        </div>
    </div>
</div>

<style lang="scss">
    @use "./mixins" as sf;

    .lan-overlay {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: rgb(0 0 0 / 45%);
    }

    .lan-dialog {
        max-width: 26rem;
        width: 100%;
        padding: 1.5rem 1.6rem;
        border-radius: 0.9rem;
        background: var(--canvas-elevated);
        border: 1px solid var(--border);
        box-shadow: var(--sf-shadow-2, 0 12px 40px rgb(0 0 0 / 25%));
        text-align: center;
    }

    .lan-dialog h2 {
        margin: 0 0 0.6rem;
        font-size: 1.25rem;
    }

    .address {
        font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
        font-size: 1.15rem;
        font-weight: 700;
        margin: 0.4rem 0;
        user-select: text;
    }

    .qr {
        display: block;
        margin: 0.6rem auto;
        border-radius: 0.5rem;
        background: #fff;
        padding: 0.4rem;
    }

    .hint {
        font-size: 0.8rem;
        color: var(--sf-dim);
        margin: 0.4rem 0;
    }

    .error {
        color: var(--sf-err);
        font-weight: 600;
    }

    .code-row {
        display: flex;
        gap: 0.4rem;
        margin: 0.5rem 0;

        input {
            flex: 1;
            min-width: 0;
            font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
            font-size: 0.72rem;
        }

        button {
            @include sf.button-secondary;
        }
    }

    .lan-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.6rem;
        margin-top: 1rem;

        .stop {
            @include sf.button-base;
            padding: 0.55rem 1.1rem;
            border: none;
            background: var(--sf-err);
            color: #fff;
            font-weight: 700;

            &:disabled {
                opacity: 0.5;
                cursor: default;
            }
        }

        .close {
            @include sf.button-secondary;
        }
    }
</style>
```

Check `ts/routes/mcat/lib/mixins` for the exact mixin names before relying on `button-secondary`/`button-base`; `McatDashboard.svelte` uses `sf.button-primary`, `sf.button-secondary`, `sf.button-base`, `sf.button-ghost`, so these exist.

- [ ] **Step 3: Wire the button into the dashboard**

In `ts/routes/mcat/McatDashboard.svelte`:

Script additions (near the other `let` state, ~line 22):

```ts
import LanServerModal from "./lib/LanServerModal.svelte";

let lanOpen = false;
```

Template: in the `.actions` div (after the "Take diagnostic" button, ~line 166):

```svelte
<button class="secondary" on:click={() => (lanOpen = true)}>
    Phone access
</button>
```

And after the `{#if confirmingReset}` block's `{/if}` (~line 215):

```svelte
{#if lanOpen}
    <LanServerModal on:close={() => (lanOpen = false)} />
{/if}
```

- [ ] **Step 4: Run the web gate**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
tools\ninja qt check:svelte check:typescript check:eslint check:format check:vitest
```

Expected: passes (run `tools\ninja format` first if only formatting fails).

- [ ] **Step 5: Manual verification in the running app**

```powershell
.\run.bat
```

- Open the MCAT dashboard, click **Phone access**.
- Expected: modal shows `http://<your LAN IP>:8045`, a QR code, a copyable pairing code, and firewall hint. If Windows Firewall prompts, allow on private networks.
- Click **Stop server**, reopen: it should start again cleanly.
- Leave the server running for Task 5.

- [ ] **Step 6: Commit**

```powershell
git add package.json yarn.lock ts/routes/mcat/lib/LanServerModal.svelte ts/routes/mcat/McatDashboard.svelte
git commit -m "feat: phone access modal with LAN address + pairing QR"
```

---

### Task 5: Desktop LAN end-to-end verification

**Files:** none (verification only; fix regressions in Tasks 2–4 if any check fails)

**Interfaces:**

- Consumes: running app with LAN server started (Task 4), pairing code from the modal.

- [ ] **Step 1: Extract host/port/token from the pairing code**

Copy the pairing code from the modal, then in PowerShell (paste it into `$code`):

```powershell
$pair = '<PASTE PAIRING CODE JSON HERE>' | ConvertFrom-Json
$base = "http://$($pair.host):$($pair.port)"
$auth = @{ Authorization = "Bearer $($pair.token)" }
```

- [ ] **Step 2: Allowed RPC with token → 200**

```powershell
(Invoke-WebRequest -Uri "$base/_anki/computeMcatReadiness" -Method POST -ContentType "application/binary" -Headers $auth -Body ([byte[]]@())).StatusCode
```

Expected: `200` (binary protobuf body).

- [ ] **Step 3: Same RPC without token → 403; wrong token → 403**

```powershell
try { Invoke-WebRequest -Uri "$base/_anki/computeMcatReadiness" -Method POST -ContentType "application/binary" -Body ([byte[]]@()) } catch { $_.Exception.Response.StatusCode.value__ }
try { Invoke-WebRequest -Uri "$base/_anki/computeMcatReadiness" -Method POST -ContentType "application/binary" -Headers @{Authorization="Bearer nope"} -Body ([byte[]]@()) } catch { $_.Exception.Response.StatusCode.value__ }
```

Expected: `403` twice.

- [ ] **Step 4: Non-MCAT RPC with valid token → 403**

```powershell
try { Invoke-WebRequest -Uri "$base/_anki/getDeckNames" -Method POST -ContentType "application/binary" -Headers $auth -Body ([byte[]]@()) } catch { $_.Exception.Response.StatusCode.value__ }
```

Expected: `403`.

- [ ] **Step 5: Cross-device reachability (firewall check)**

On the phone (same Wi-Fi), open `http://<host>:8045/anything` in the mobile browser.

Expected: a `403` error page — proving the phone can reach the desktop through the firewall. If it times out instead: Windows Defender Firewall → allow the Anki/python process on Private networks, then retry.

- [ ] **Step 6: Desktop app still works normally**

In the running app: review a card / open the MCAT study page. Expected: unchanged behavior (localhost path untouched).

- [ ] **Step 7: Commit any fixes; otherwise nothing to commit**

---

### Task 6: Mobile scaffold — Expo project + protobuf codegen

**Files:**

- Create: `C:\AlphaAI\wk1to3\mcat-mobile` (new Expo project)
- Create: `buf.gen.yaml`, npm script `gen:proto`
- Generated: `src/gen/anki/*_pb.ts` (committed)

**Interfaces:**

- Produces: generated schemas used by Tasks 8+: `EmptySchema` (from `src/gen/anki/generic_pb`), and from `src/gen/anki/scheduler_pb`: `McatReadinessResponseSchema`, `McatStudyQueueRequestSchema`, `McatStudyQueueResponseSchema`, `AnswerMcatCardRequestSchema`, `AnswerMcatCardResponseSchema`, `AnswerMcatCardTypedRequestSchema`, `AnswerMcatCardTypedResponseSchema`, `McatDiagnosticRequestSchema`, plus types `McatStudyItem`, `McatLeafState`, `McatReadinessResponse` and enums `McatStudyItem_Kind`, `AnswerMcatCardTypedResponse_Verdict`. Field names are camelCase in TS (`cardId`, `leafName`, `readinessScore`, …); `int64 card_id` is TS `bigint`; `uint64 seed` is `bigint`.

- [ ] **Step 1: Scaffold the project**

```powershell
cd C:\AlphaAI\wk1to3
npx create-expo-app@latest mcat-mobile
cd mcat-mobile
```

Expected: TypeScript + Expo Router template. If `git status` errors (no repo), run `git init` and make an initial commit of the scaffold.

- [ ] **Step 2: Install dependencies**

```powershell
npx expo install expo-camera @react-native-async-storage/async-storage
npm install @bufbuild/protobuf
npm install -D @bufbuild/buf @bufbuild/protoc-gen-es jest-expo jest @types/jest
```

- [ ] **Step 3: Configure codegen**

Create `buf.gen.yaml`:

```yaml
version: v2
inputs:
  - directory: ../MCATspeedrun/proto
plugins:
  - local: protoc-gen-es
    out: src/gen
    opt: target=ts
```

Add to `package.json` scripts:

```json
"gen:proto": "buf generate",
"test": "jest"
```

and a jest config section (if the template didn't add one):

```json
"jest": {
    "preset": "jest-expo"
}
```

- [ ] **Step 4: Generate and verify**

```powershell
npm run gen:proto
npx tsc --noEmit
```

Expected: `src/gen/anki/scheduler_pb.ts`, `src/gen/anki/generic_pb.ts`, `src/gen/anki/frontend_pb.ts` (and other anki protos) exist; typecheck passes. If `tsc` complains about unrelated template files, fix per message; if it complains inside `src/gen`, check that `@bufbuild/protobuf` is v2 (same major as `protoc-gen-es`).

- [ ] **Step 5: Smoke-test the app boots in Expo Go**

```powershell
npx expo start
```

Scan the terminal QR with the Expo Go app on the phone. Expected: template home screen renders. Stop the dev server.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: scaffold Expo app with protobuf codegen from MCATspeedrun protos"
```

---

### Task 7: Pairing payload parsing + config storage

**Files:**

- Create: `src/api/pairing.ts`, `src/api/storage.ts`
- Test: `__tests__/pairing.test.ts`

**Interfaces:**

- Consumes: pairing JSON format from Task 4 (`{"v":1,"host","port","token"}`).
- Produces (used by Tasks 8–13):
  - `interface ServerConfig { host: string; port: number; token: string }`
  - `parsePairingPayload(raw: string): ServerConfig` (throws `Error` with a user-readable message on anything invalid)
  - `baseUrl(config: ServerConfig): string` → `http://<host>:<port>`
  - `loadServerConfig(): Promise<ServerConfig | null>`, `saveServerConfig(c: ServerConfig): Promise<void>`, `clearServerConfig(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/pairing.test.ts`:

```ts
import { baseUrl, parsePairingPayload } from "../src/api/pairing";

const VALID = JSON.stringify({
    v: 1,
    host: "192.168.1.23",
    port: 8045,
    token: "abc123",
});

describe("parsePairingPayload", () => {
    it("parses a valid payload", () => {
        expect(parsePairingPayload(VALID)).toEqual({
            host: "192.168.1.23",
            port: 8045,
            token: "abc123",
        });
    });

    it("rejects non-JSON", () => {
        expect(() => parsePairingPayload("not json")).toThrow(/pairing code/i);
    });

    it("rejects wrong version", () => {
        expect(() =>
            parsePairingPayload(
                JSON.stringify({ v: 2, host: "h", port: 1, token: "t" }),
            )
        ).toThrow(/version/i);
    });

    it.each([
        ["host", { v: 1, port: 8045, token: "t" }],
        ["port", { v: 1, host: "h", token: "t" }],
        ["token", { v: 1, host: "h", port: 8045 }],
    ])("rejects missing %s", (_field, payload) => {
        expect(() => parsePairingPayload(JSON.stringify(payload))).toThrow();
    });

    it("rejects out-of-range port", () => {
        expect(() =>
            parsePairingPayload(
                JSON.stringify({ v: 1, host: "h", port: 70000, token: "t" }),
            )
        ).toThrow();
    });
});

describe("baseUrl", () => {
    it("builds an http URL", () => {
        expect(baseUrl({ host: "192.168.1.23", port: 8045, token: "x" })).toBe(
            "http://192.168.1.23:8045",
        );
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm test
```

Expected: FAIL — cannot find module `../src/api/pairing`.

- [ ] **Step 3: Implement**

Create `src/api/pairing.ts`:

```ts
export interface ServerConfig {
    host: string;
    port: number;
    token: string;
}

/** Parse the QR / pasted pairing code produced by the desktop app. */
export function parsePairingPayload(raw: string): ServerConfig {
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error(
            "That doesn't look like a pairing code (invalid JSON).",
        );
    }
    const obj = data as Record<string, unknown>;
    if (obj?.v !== 1) {
        throw new Error("Unsupported pairing code version — update this app.");
    }
    const { host, port, token } = obj;
    if (typeof host !== "string" || host.length === 0) {
        throw new Error("Pairing code is missing the host address.");
    }
    if (
        typeof port !== "number"
        || !Number.isInteger(port)
        || port < 1
        || port > 65535
    ) {
        throw new Error("Pairing code has an invalid port.");
    }
    if (typeof token !== "string" || token.length === 0) {
        throw new Error("Pairing code is missing the token.");
    }
    return { host, port, token };
}

export function baseUrl(config: ServerConfig): string {
    return `http://${config.host}:${config.port}`;
}
```

Create `src/api/storage.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ServerConfig } from "./pairing";
import { parsePairingPayload } from "./pairing";

const KEY = "mcat.serverConfig";

export async function loadServerConfig(): Promise<ServerConfig | null> {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
        return null;
    }
    try {
        const { host, port, token } = JSON.parse(raw);
        return parsePairingPayload(JSON.stringify({ v: 1, host, port, token }));
    } catch {
        return null; // corrupt storage: treat as unpaired
    }
}

export async function saveServerConfig(config: ServerConfig): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(config));
}

export async function clearServerConfig(): Promise<void> {
    await AsyncStorage.removeItem(KEY);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/api/pairing.ts src/api/storage.ts __tests__/pairing.test.ts
git commit -m "feat: pairing payload parsing and server config storage"
```

---

### Task 8: API client — `callBackend` + 7 typed RPC wrappers

**Files:**

- Create: `src/api/client.ts`
- Test: `__tests__/client.test.ts`

**Interfaces:**

- Consumes: `ServerConfig` (Task 7); generated schemas (Task 6).
- Produces (used by Tasks 9–13):
  - `class ApiError extends Error { status: number }`
  - `callBackend(config, method, body: Uint8Array, timeoutMs?): Promise<Uint8Array>`
  - Typed wrappers, each `(config: ServerConfig, init) => Promise<...>`: `computeMcatReadiness`, `recomputeMcatLeafStates`, `getMcatStudyQueue`, `answerMcatCard`, `answerMcatCardTyped` (90s timeout), `getMcatDiagnostic`, `resetMcatProgress`
  - `mediaUrl(config, filename): string` and `mediaHeaders(config): { Authorization: string }` for card images

- [ ] **Step 1: Write the failing tests**

Create `__tests__/client.test.ts`:

```ts
import { create, toBinary } from "@bufbuild/protobuf";

import { McatReadinessResponseSchema } from "../src/gen/anki/scheduler_pb";

const mockFetch = jest.fn();
jest.mock(
    "expo/fetch",
    () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }),
);

import { ApiError, computeMcatReadiness, mediaUrl } from "../src/api/client";

const CONFIG = { host: "192.168.1.23", port: 8045, token: "tok" };

function okResponse(bytes: Uint8Array) {
    return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
            bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
            ),
        text: async () => "",
    };
}

describe("computeMcatReadiness", () => {
    beforeEach(() => mockFetch.mockReset());

    it("POSTs binary protobuf with auth header and parses the response", async () => {
        const fixture = create(McatReadinessResponseSchema, {
            readinessScore: 501,
            readinessPct: 55,
        });
        mockFetch.mockResolvedValue(
            okResponse(toBinary(McatReadinessResponseSchema, fixture)),
        );

        const resp = await computeMcatReadiness(CONFIG, {});

        expect(resp.readinessScore).toBe(501);
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe("http://192.168.1.23:8045/_anki/computeMcatReadiness");
        expect(init.method).toBe("POST");
        expect(init.headers["Content-Type"]).toBe("application/binary");
        expect(init.headers.Authorization).toBe("Bearer tok");
        expect(init.body).toBeInstanceOf(Uint8Array);
        expect(init.signal).toBeDefined();
    });

    it("throws ApiError with status on non-200", async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => "forbidden",
            arrayBuffer: async () => new ArrayBuffer(0),
        });
        await expect(computeMcatReadiness(CONFIG, {})).rejects.toMatchObject({
            status: 403,
        });
        await expect(
            computeMcatReadiness(CONFIG, {}),
        ).rejects.toBeInstanceOf(ApiError);
    });
});

describe("mediaUrl", () => {
    it("builds a root-path URL", () => {
        expect(mediaUrl(CONFIG, "img.jpg")).toBe(
            "http://192.168.1.23:8045/img.jpg",
        );
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm test -- client
```

Expected: FAIL — cannot find module `../src/api/client`.

- [ ] **Step 3: Implement**

Create `src/api/client.ts`:

```ts
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type {
    DescMessage,
    MessageInitShape,
    MessageShape,
} from "@bufbuild/protobuf";
import { fetch } from "expo/fetch";

import { EmptySchema } from "../gen/anki/generic_pb";
import {
    AnswerMcatCardRequestSchema,
    AnswerMcatCardResponseSchema,
    AnswerMcatCardTypedRequestSchema,
    AnswerMcatCardTypedResponseSchema,
    McatDiagnosticRequestSchema,
    McatReadinessResponseSchema,
    McatStudyQueueRequestSchema,
    McatStudyQueueResponseSchema,
} from "../gen/anki/scheduler_pb";
import type { ServerConfig } from "./pairing";
import { baseUrl } from "./pairing";

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
    }
}

const DEFAULT_TIMEOUT_MS = 15_000;
// LLM grading legitimately takes tens of seconds; don't kill it early.
const GRADING_TIMEOUT_MS = 90_000;

export async function callBackend(
    config: ServerConfig,
    method: string,
    body: Uint8Array,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Uint8Array> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(`${baseUrl(config)}/_anki/${method}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/binary",
                Authorization: `Bearer ${config.token}`,
            },
            // toBinary returns Uint8Array<ArrayBufferLike>; the DOM BodyInit
            // type (TS 6.x) requires an ArrayBuffer-backed view. toBinary
            // always allocates a fresh ArrayBuffer, so this cast is sound.
            body: body as Uint8Array<ArrayBuffer>,
            signal: controller.signal,
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => "request failed");
            throw new ApiError(resp.status, `${resp.status}: ${text}`);
        }
        return new Uint8Array(await resp.arrayBuffer());
    } finally {
        clearTimeout(timer);
    }
}

function rpc<I extends DescMessage, O extends DescMessage>(
    method: string,
    inSchema: I,
    outSchema: O,
    timeoutMs?: number,
) {
    return async (
        config: ServerConfig,
        init: MessageInitShape<I>,
    ): Promise<MessageShape<O>> => {
        const bytes = toBinary(inSchema, create(inSchema, init));
        const out = await callBackend(config, method, bytes, timeoutMs);
        return fromBinary(outSchema, out);
    };
}

export const computeMcatReadiness = rpc(
    "computeMcatReadiness",
    EmptySchema,
    McatReadinessResponseSchema,
);
export const recomputeMcatLeafStates = rpc(
    "recomputeMcatLeafStates",
    EmptySchema,
    McatReadinessResponseSchema,
);
export const getMcatStudyQueue = rpc(
    "getMcatStudyQueue",
    McatStudyQueueRequestSchema,
    McatStudyQueueResponseSchema,
);
export const answerMcatCard = rpc(
    "answerMcatCard",
    AnswerMcatCardRequestSchema,
    AnswerMcatCardResponseSchema,
);
export const answerMcatCardTyped = rpc(
    "answerMcatCardTyped",
    AnswerMcatCardTypedRequestSchema,
    AnswerMcatCardTypedResponseSchema,
    GRADING_TIMEOUT_MS,
);
export const getMcatDiagnostic = rpc(
    "getMcatDiagnostic",
    McatDiagnosticRequestSchema,
    McatStudyQueueResponseSchema,
);
export const resetMcatProgress = rpc(
    "resetMcatProgress",
    EmptySchema,
    McatReadinessResponseSchema,
);

/** URL for a media file (card image); served from the LAN server root. */
export function mediaUrl(config: ServerConfig, filename: string): string {
    return `${baseUrl(config)}/${encodeURIComponent(filename)}`;
}

export function mediaHeaders(config: ServerConfig): { Authorization: string } {
    return { Authorization: `Bearer ${config.token}` };
}
```

Note: the `body: body as Uint8Array<ArrayBuffer>` cast satisfies the compiler and keeps a `Uint8Array` at runtime (so the test's `instanceof Uint8Array` assertion holds). If `expo/fetch` still rejects a `Uint8Array` body at runtime on-device (the on-device round-trip will reveal it), switch to `body: body.slice().buffer as ArrayBuffer,` and update the test's body assertion then — not before it's confirmed on-device.

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm test
```

Expected: all PASS (pairing + client suites).

- [ ] **Step 5: Commit**

```powershell
git add src/api/client.ts __tests__/client.test.ts
git commit -m "feat: binary-protobuf API client with typed MCAT RPC wrappers"
```

---

### Task 9: Connection context, Pair screen (QR scan + paste), app shell

**Files:**

- Create: `src/api/ConnectionContext.tsx`, `src/components/ErrorBanner.tsx`
- Create/Replace: `app/_layout.tsx`, `app/index.tsx` (placeholder for Task 10), `app/pair.tsx`
- Remove template screens the scaffold added (e.g. `app/(tabs)/` if present) so routes are exactly `/`, `/pair`, `/study`, `/diagnostic`.

**Interfaces:**

- Consumes: Tasks 7–8 modules.
- Produces (used by Tasks 10–13):
  - `useConnection(): { config: ServerConfig | null; ready: boolean; pair(c: ServerConfig): Promise<void>; unpair(): Promise<void> }` via `<ConnectionProvider>` in the root layout
  - `<ErrorBanner message={string} onRetry={() => void} onRepair={() => void} />`
  - Route convention: unpaired ⇒ redirect to `/pair`

- [ ] **Step 1: Connection context**

Create `src/api/ConnectionContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { ServerConfig } from "./pairing";
import {
    clearServerConfig,
    loadServerConfig,
    saveServerConfig,
} from "./storage";

interface Connection {
    config: ServerConfig | null;
    /** False until AsyncStorage has been read on boot. */
    ready: boolean;
    pair(config: ServerConfig): Promise<void>;
    unpair(): Promise<void>;
}

const ConnectionContext = createContext<Connection | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<ServerConfig | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        loadServerConfig()
            .then(setConfig)
            .finally(() => setReady(true));
    }, []);

    async function pair(next: ServerConfig): Promise<void> {
        await saveServerConfig(next);
        setConfig(next);
    }

    async function unpair(): Promise<void> {
        await clearServerConfig();
        setConfig(null);
    }

    return (
        <ConnectionContext.Provider value={{ config, ready, pair, unpair }}>
            {children}
        </ConnectionContext.Provider>
    );
}

export function useConnection(): Connection {
    const ctx = useContext(ConnectionContext);
    if (!ctx) {
        throw new Error("useConnection must be used inside ConnectionProvider");
    }
    return ctx;
}
```

- [ ] **Step 2: Error banner component**

Create `src/components/ErrorBanner.tsx`:

```tsx
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function ErrorBanner({
    message,
    onRetry,
    onRepair,
}: {
    message: string;
    onRetry?: () => void;
    onRepair?: () => void;
}) {
    return (
        <View style={styles.banner}>
            <Text style={styles.text}>{message}</Text>
            <Text style={styles.hint}>
                Is the desktop's Phone access server running, and is this phone
                on the same Wi-Fi (not cellular)?
            </Text>
            <View style={styles.row}>
                {onRetry && (
                    <TouchableOpacity style={styles.btn} onPress={onRetry}>
                        <Text style={styles.btnText}>Retry</Text>
                    </TouchableOpacity>
                )}
                {onRepair && (
                    <TouchableOpacity style={styles.btn} onPress={onRepair}>
                        <Text style={styles.btnText}>Re-pair</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        backgroundColor: "#7a1f1f",
        padding: 12,
        borderRadius: 10,
        margin: 12,
    },
    text: { color: "#fff", fontWeight: "600" },
    hint: { color: "#ffffffbb", fontSize: 12, marginTop: 4 },
    row: { flexDirection: "row", gap: 12, marginTop: 8 },
    btn: {
        backgroundColor: "#ffffff22",
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 8,
    },
    btnText: { color: "#fff", fontWeight: "700" },
});
```

- [ ] **Step 3: Root layout + placeholder index**

Replace `app/_layout.tsx` content with:

```tsx
import { Stack } from "expo-router";

import { ConnectionProvider } from "../src/api/ConnectionContext";

export default function RootLayout() {
    return (
        <ConnectionProvider>
            <Stack>
                <Stack.Screen name="index" options={{ title: "MCAT" }} />
                <Stack.Screen
                    name="pair"
                    options={{ title: "Pair with desktop" }}
                />
                <Stack.Screen name="study" options={{ title: "Study" }} />
                <Stack.Screen
                    name="diagnostic"
                    options={{ title: "Diagnostic" }}
                />
            </Stack>
        </ConnectionProvider>
    );
}
```

Replace `app/index.tsx` with a placeholder that Task 10 will flesh out:

```tsx
import { Redirect } from "expo-router";
import { Text, View } from "react-native";

import { useConnection } from "../src/api/ConnectionContext";

export default function Dashboard() {
    const { config, ready } = useConnection();
    if (!ready) {
        return null;
    }
    if (!config) {
        return <Redirect href="/pair" />;
    }
    return (
        <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
            <Text>Paired with {config.host}:{config.port}</Text>
        </View>
    );
}
```

Delete leftover template routes (e.g. `app/(tabs)/`, `app/+not-found.tsx` can stay) so `npx expo start` shows this index. Create empty placeholder screens `app/study.tsx` and `app/diagnostic.tsx`:

```tsx
import { Text, View } from "react-native";

export default function Placeholder() {
    return (
        <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
            <Text>Coming soon</Text>
        </View>
    );
}
```

- [ ] **Step 4: Pair screen**

Create `app/pair.tsx`:

```tsx
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Button,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { computeMcatReadiness } from "../src/api/client";
import { useConnection } from "../src/api/ConnectionContext";
import { parsePairingPayload } from "../src/api/pairing";

export default function Pair() {
    const { pair } = useConnection();
    const [permission, requestPermission] = useCameraPermissions();
    const [pasted, setPasted] = useState("");
    const [error, setError] = useState("");
    const [verifying, setVerifying] = useState(false);

    async function connect(raw: string): Promise<void> {
        if (verifying) {
            return;
        }
        setError("");
        setVerifying(true);
        try {
            const config = parsePairingPayload(raw);
            // one cheap RPC round-trip proves host/port/token all work
            await computeMcatReadiness(config, {});
            await pair(config);
            router.replace("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setVerifying(false);
        }
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.heading}>
                On the desktop, open the MCAT dashboard and press “Phone
                access”, then scan the QR code.
            </Text>
            {permission?.granted
                ? (
                    <CameraView
                        style={styles.camera}
                        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                        onBarcodeScanned={({ data }) => connect(data)}
                    />
                )
                : (
                    <Button
                        title="Allow camera to scan the QR code"
                        onPress={requestPermission}
                    />
                )}
            <Text style={styles.or}>…or paste the pairing code:</Text>
            <TextInput
                style={styles.input}
                value={pasted}
                onChangeText={setPasted}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder='{"v":1,"host":"192.168.…","port":8045,"token":"…"}'
                multiline
            />
            <Button
                title="Connect"
                disabled={verifying || pasted.trim().length === 0}
                onPress={() => connect(pasted.trim())}
            />
            {verifying && <ActivityIndicator style={styles.spinner} />}
            {error !== "" && <Text style={styles.error}>{error}</Text>}
            <Text style={styles.hint}>
                iOS may ask for Local Network access on first connect — allow
                it. The phone must be on the same Wi-Fi as the desktop.
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 12 },
    heading: { fontSize: 15, lineHeight: 21 },
    camera: { height: 280, borderRadius: 12, overflow: "hidden" },
    or: { marginTop: 8, fontWeight: "600" },
    input: {
        borderWidth: 1,
        borderColor: "#999",
        borderRadius: 8,
        padding: 10,
        minHeight: 64,
        fontFamily: "monospace",
        fontSize: 12,
    },
    spinner: { marginTop: 8 },
    error: { color: "#c0392b", fontWeight: "600" },
    hint: { color: "#777", fontSize: 12, marginTop: 8 },
});
```

Note: `onBarcodeScanned` fires repeatedly; `connect` guards with `verifying`. If duplicate scans still race, debounce with a `useRef<boolean>` latch set on first fire.

- [ ] **Step 5: Typecheck + unit tests**

```powershell
npx tsc --noEmit
npm test
```

Expected: pass.

- [ ] **Step 6: On-device pairing milestone (THE critical check)**

1. Desktop: `.\run.bat` → MCAT dashboard → **Phone access** (server running).
2. Phone: `npx expo start`, open in Expo Go.
3. App redirects to Pair; allow camera; scan the modal's QR.
4. Expected: brief spinner, then "Paired with 192.168.x.x:8045" screen.
5. Also verify the paste fallback: unpair is not built yet, so force-quit + relaunch Expo Go, or temporarily clear app data — or simply verify paste before scanning on first run.
6. If iOS shows the Local Network prompt, accept and retry once.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat: pairing flow with QR scan, paste fallback, connection context"
```

---

### Task 10: Dashboard screen

**Files:**

- Create: `src/components/MeterBar.tsx`
- Replace: `app/index.tsx`

**Interfaces:**

- Consumes: `computeMcatReadiness`, `recomputeMcatLeafStates`, `ApiError` (Task 8); `useConnection`, `ErrorBanner` (Task 9); `McatReadinessResponse`, `McatLeafState` types (Task 6).
- Produces: `<MeterBar value={number 0..1} />` reused by Tasks 11–12.

- [ ] **Step 1: MeterBar component**

Create `src/components/MeterBar.tsx`:

```tsx
import { StyleSheet, View } from "react-native";

export function MeterBar({ value }: { value: number }) {
    const pct = Math.max(0, Math.min(1, value)) * 100;
    return (
        <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        flex: 1,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#00000022",
        overflow: "hidden",
    },
    fill: { height: "100%", borderRadius: 4, backgroundColor: "#f5c451" },
});
```

- [ ] **Step 2: Dashboard screen**

Replace `app/index.tsx`:

```tsx
import { Redirect, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    Button,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import {
    ApiError,
    computeMcatReadiness,
    recomputeMcatLeafStates,
} from "../src/api/client";
import { useConnection } from "../src/api/ConnectionContext";
import { ErrorBanner } from "../src/components/ErrorBanner";
import { MeterBar } from "../src/components/MeterBar";
import type {
    McatLeafState,
    McatReadinessResponse,
} from "../src/gen/anki/scheduler_pb";

interface Section {
    label: string;
    leaves: McatLeafState[];
}

function groupBySection(leaves: McatLeafState[]): Section[] {
    const order: string[] = [];
    const map = new Map<string, McatLeafState[]>();
    for (const leaf of leaves) {
        if (!map.has(leaf.section)) {
            map.set(leaf.section, []);
            order.push(leaf.section);
        }
        map.get(leaf.section)!.push(leaf);
    }
    return order.map((label) => ({ label, leaves: map.get(label)! }));
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function Dashboard() {
    const { config, ready, unpair } = useConnection();
    const [readiness, setReadiness] = useState<McatReadinessResponse | null>(
        null,
    );
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(
        async (recompute: boolean) => {
            if (!config) {
                return;
            }
            setError("");
            try {
                const resp = recompute
                    ? await recomputeMcatLeafStates(config, {})
                    : await computeMcatReadiness(config, {});
                setReadiness(resp);
            } catch (err) {
                setError(
                    err instanceof ApiError
                        && (err.status === 401 || err.status === 403)
                        ? "The desktop rejected this phone's pairing."
                        : "Couldn't reach the desktop.",
                );
            }
        },
        [config],
    );

    useFocusEffect(
        useCallback(() => {
            load(false);
        }, [load]),
    );

    if (!ready) {
        return null;
    }
    if (!config) {
        return <Redirect href="/pair" />;
    }

    return (
        <ScrollView
            contentContainerStyle={styles.container}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={async () => {
                        setRefreshing(true);
                        await load(true);
                        setRefreshing(false);
                    }}
                />
            }
        >
            {error !== "" && (
                <ErrorBanner
                    message={error}
                    onRetry={() => load(false)}
                    onRepair={async () => {
                        await unpair();
                        router.replace("/pair");
                    }}
                />
            )}
            {readiness && (
                <>
                    <View style={styles.scoreCard}>
                        <Text style={styles.score}>
                            {readiness.readinessScore}
                            <Text style={styles.scale}>/ 528</Text>
                        </Text>
                        <Text style={styles.meta}>
                            {Math.round(readiness.readinessPct)}% blueprint
                            mastery · ±{readiness.confidenceBand} pts ·{" "}
                            {Math.round(readiness.confidencePct)}% confidence
                        </Text>
                        <View style={styles.metricRow}>
                            <Text style={styles.metricLabel}>coverage</Text>
                            <MeterBar value={readiness.coverage} />
                            <Text style={styles.metricVal}>
                                {pct(readiness.coverage)}
                            </Text>
                        </View>
                        <View style={styles.metricRow}>
                            <Text style={styles.metricLabel}>depth</Text>
                            <MeterBar value={readiness.depth} />
                            <Text style={styles.metricVal}>
                                {pct(readiness.depth)}
                            </Text>
                        </View>
                        <View style={styles.metricRow}>
                            <Text style={styles.metricLabel}>freshness</Text>
                            <MeterBar value={readiness.freshness} />
                            <Text style={styles.metricVal}>
                                {pct(readiness.freshness)}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.actions}>
                        <Button
                            title="Study now"
                            onPress={() => router.push("/study")}
                        />
                        <Button
                            title="Take diagnostic"
                            onPress={() => router.push("/diagnostic")}
                        />
                    </View>
                    {groupBySection(readiness.leaves).map((section) => (
                        <View key={section.label} style={styles.section}>
                            <Text style={styles.sectionLabel}>
                                {section.label}
                            </Text>
                            {section.leaves.map((leaf) => (
                                <View
                                    key={leaf.leafId}
                                    style={[
                                        styles.leaf,
                                        !leaf.assessed && styles.unassessed,
                                    ]}
                                >
                                    <Text
                                        style={styles.leafName}
                                        numberOfLines={2}
                                    >
                                        {leaf.name}
                                    </Text>
                                    {!leaf.isCars && (
                                        <View style={styles.metricRow}>
                                            <Text style={styles.metricLabel}>
                                                fluency
                                            </Text>
                                            <MeterBar value={leaf.fluency} />
                                            <Text style={styles.metricVal}>
                                                {pct(leaf.fluency)}
                                            </Text>
                                        </View>
                                    )}
                                    <View style={styles.metricRow}>
                                        <Text style={styles.metricLabel}>
                                            application
                                        </Text>
                                        <MeterBar value={leaf.application} />
                                        <Text style={styles.metricVal}>
                                            {pct(leaf.application)}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    ))}
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 16 },
    scoreCard: {
        padding: 16,
        borderRadius: 14,
        backgroundColor: "#00000010",
        gap: 6,
    },
    score: { fontSize: 52, fontWeight: "900" },
    scale: { fontSize: 18, fontWeight: "400", color: "#888" },
    meta: { color: "#666" },
    actions: { gap: 8 },
    section: { gap: 8 },
    sectionLabel: {
        fontSize: 13,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 1,
        color: "#888",
    },
    leaf: {
        padding: 10,
        borderRadius: 10,
        backgroundColor: "#00000008",
        gap: 4,
    },
    unassessed: { opacity: 0.5 },
    leafName: { fontWeight: "600" },
    metricRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    metricLabel: { width: 78, fontSize: 12, color: "#777" },
    metricVal: { width: 42, textAlign: "right", fontSize: 12, color: "#777" },
});
```

- [ ] **Step 3: Typecheck + tests**

```powershell
npx tsc --noEmit
npm test
```

Expected: pass.

- [ ] **Step 4: On-device verification**

With desktop LAN server running: dashboard shows the same readiness score as desktop; pull-to-refresh recomputes; stopping the desktop server then pulling shows the error banner; Retry works after restarting the server.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: mobile dashboard with readiness score and leaf mastery"
```

---

### Task 11: Study screen (MCQ + typed flashcards + images)

**Files:**

- Create: `src/components/McqCard.tsx`, `src/components/TypedFlashcard.tsx`
- Replace: `app/study.tsx`

**Interfaces:**

- Consumes: `getMcatStudyQueue`, `answerMcatCard`, `answerMcatCardTyped`, `mediaUrl`, `mediaHeaders` (Task 8); `useConnection`, `ErrorBanner` (Task 9); `McatStudyItem`, `McatStudyItem_Kind`, `AnswerMcatCardTypedResponse_Verdict` (Task 6). `item.cardId` is `bigint` — pass through as-is to answer requests.
- Produces: `<McqCard item config showFeedback onAnswered(correct) />` reused by Task 12.

Behavior contract (mirrors `ts/routes/mcat/study/StudyPage.svelte`):

- MCQ: stem = `item.front`; if `item.image` non-empty, show image (letters-only choices); choices A–D from `item.choices`; extra "I don't know" always grades incorrect; on choose → `answerMcatCard({ cardId, correct: letter === item.answer, millisecondsTaken, selfRating: 0 })`; then (when `showFeedback`) reveal correct/incorrect + `item.explanation`; Next advances.
- Flashcard: prompt = `item.front`; TextInput answer; Submit → `answerMcatCardTyped({ cardId, typedAnswer, millisecondsTaken, gaveUp: false })`; "I don't know" or empty submit → `gaveUp: true`. Block until verdict (spinner); on API error keep the same submission and show Retry (no self-grade fallback); on verdict show Correct/Partial/Incorrect + `feedback` + `item.back`; Next advances.
- `millisecondsTaken`: from card shown to first submit, capped at 10 minutes.

- [ ] **Step 1: McqCard component**

Create `src/components/McqCard.tsx`:

```tsx
import { useRef, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { answerMcatCard, mediaHeaders, mediaUrl } from "../api/client";
import type { ServerConfig } from "../api/pairing";
import type { McatStudyItem } from "../gen/anki/scheduler_pb";

const LETTERS = ["A", "B", "C", "D"];

export function McqCard({
    item,
    config,
    showFeedback,
    onAnswered,
}: {
    item: McatStudyItem;
    config: ServerConfig;
    /** false during diagnostics (exam mode) */
    showFeedback: boolean;
    onAnswered: (correct: boolean) => void;
}) {
    const [chosen, setChosen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [startedAt] = useState(() => Date.now());
    // Frozen on the first attempt so a failed-then-retried submit doesn't
    // inflate millisecondsTaken — the MCQ FSRS grade is derived from it.
    const submittedMsRef = useRef<number | null>(null);
    const lettersOnly = item.image !== "";

    async function choose(letter: string, idk: boolean): Promise<void> {
        if (chosen !== null || busy) {
            return;
        }
        setBusy(true);
        setError("");
        const correct = !idk && letter === item.answer;
        const ms = submittedMsRef.current
            ?? Math.min(Date.now() - startedAt, 10 * 60 * 1000);
        submittedMsRef.current = ms;
        try {
            await answerMcatCard(config, {
                cardId: item.cardId,
                correct,
                millisecondsTaken: ms,
                selfRating: 0,
            });
            setChosen(idk ? "__idk__" : letter);
            onAnswered(correct);
        } catch {
            setError(
                "Couldn't submit the answer — check the connection and tap a choice again.",
            );
        } finally {
            setBusy(false);
        }
    }

    const answered = chosen !== null;
    const wasCorrect = chosen === item.answer;

    return (
        <View style={styles.card}>
            <Text style={styles.leaf}>
                {item.leafId} · {item.leafName}
            </Text>
            {item.front !== "" && <Text style={styles.stem}>{item.front}</Text>}
            {item.image !== "" && (
                <Image
                    style={styles.image}
                    resizeMode="contain"
                    source={{
                        uri: mediaUrl(config, item.image),
                        headers: mediaHeaders(config),
                    }}
                />
            )}
            {item.choices.map((choice, i) => {
                const letter = LETTERS[i] ?? String(i + 1);
                const isAnswer = letter === item.answer;
                const isChosen = letter === chosen;
                return (
                    <TouchableOpacity
                        key={letter}
                        disabled={answered || busy}
                        style={[
                            styles.choice,
                            answered && showFeedback && isAnswer
                            && styles.correctChoice,
                            answered && showFeedback && isChosen && !isAnswer
                            && styles.wrongChoice,
                        ]}
                        onPress={() => choose(letter, false)}
                    >
                        <Text style={styles.choiceText}>
                            {letter}
                            {lettersOnly ? "" : `. ${choice}`}
                        </Text>
                    </TouchableOpacity>
                );
            })}
            {!answered && (
                <TouchableOpacity
                    disabled={busy}
                    style={[styles.choice, styles.idk]}
                    onPress={() => choose("", true)}
                >
                    <Text style={styles.choiceText}>I don't know</Text>
                </TouchableOpacity>
            )}
            {error !== "" && <Text style={styles.error}>{error}</Text>}
            {answered && showFeedback && (
                <View style={styles.feedback}>
                    <Text style={styles.verdict}>
                        {chosen === "__idk__"
                            ? `Didn't know — answer: ${item.answer}`
                            : wasCorrect
                            ? "Correct"
                            : `Incorrect — answer: ${item.answer}`}
                    </Text>
                    {item.explanation !== "" && (
                        <Text style={styles.explanation}>
                            {item.explanation}
                        </Text>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { gap: 10 },
    leaf: { fontSize: 12, color: "#888" },
    stem: { fontSize: 16, lineHeight: 23 },
    image: {
        width: "100%",
        height: 260,
        borderRadius: 8,
        backgroundColor: "#fff",
    },
    choice: {
        borderWidth: 1,
        borderColor: "#8886",
        borderRadius: 10,
        padding: 12,
    },
    idk: { borderStyle: "dashed", opacity: 0.8 },
    correctChoice: { borderColor: "#2e7d32", backgroundColor: "#2e7d3222" },
    wrongChoice: { borderColor: "#c62828", backgroundColor: "#c6282822" },
    choiceText: { fontSize: 15 },
    error: { color: "#c0392b" },
    feedback: { gap: 6, marginTop: 4 },
    verdict: { fontWeight: "800" },
    explanation: { color: "#555", lineHeight: 20 },
});
```

- [ ] **Step 2: TypedFlashcard component**

Create `src/components/TypedFlashcard.tsx`:

```tsx
import { useState } from "react";
import {
    ActivityIndicator,
    Button,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { answerMcatCardTyped } from "../api/client";
import type { ServerConfig } from "../api/pairing";
import type { McatStudyItem } from "../gen/anki/scheduler_pb";
import { AnswerMcatCardTypedResponse_Verdict as Verdict } from "../gen/anki/scheduler_pb";

type Phase = "prompt" | "grading" | "graded" | "error";

export function TypedFlashcard({
    item,
    config,
    onGraded,
}: {
    item: McatStudyItem;
    config: ServerConfig;
    onGraded: (verdict: Verdict) => void;
}) {
    const [phase, setPhase] = useState<Phase>("prompt");
    const [typed, setTyped] = useState("");
    const [verdict, setVerdict] = useState<Verdict>(Verdict.INCORRECT);
    const [feedback, setFeedback] = useState("");
    const [gaveUp, setGaveUp] = useState(false);
    const [gradeError, setGradeError] = useState("");
    const [startedAt] = useState(() => Date.now());
    const [submittedMs, setSubmittedMs] = useState(0);

    // Blocks until a verdict arrives; on failure the card stays unanswered and
    // the same submission can be retried (no self-grade fallback).
    async function submit(giveUp: boolean): Promise<void> {
        if (phase === "grading" || phase === "graded") {
            return;
        }
        const ms = phase === "prompt"
            ? Math.min(Date.now() - startedAt, 10 * 60 * 1000)
            : submittedMs; // retries reuse the first-submit latency
        setSubmittedMs(ms);
        const didGiveUp = giveUp || typed.trim().length === 0;
        setGaveUp(didGiveUp);
        setPhase("grading");
        setGradeError("");
        try {
            const resp = await answerMcatCardTyped(config, {
                cardId: item.cardId,
                typedAnswer: typed,
                millisecondsTaken: ms,
                gaveUp: didGiveUp,
            });
            setVerdict(resp.verdict);
            setFeedback(resp.feedback);
            setPhase("graded");
            onGraded(resp.verdict);
        } catch (err) {
            setPhase("error");
            setGradeError(err instanceof Error ? err.message : String(err));
        }
    }

    const verdictLabel = gaveUp
        ? "Didn't know — marked Again"
        : verdict === Verdict.CORRECT
        ? "Correct"
        : verdict === Verdict.PARTIAL
        ? "Partially correct"
        : "Incorrect";

    return (
        <View style={styles.card}>
            <Text style={styles.leaf}>
                {item.leafId} · {item.leafName}
            </Text>
            <Text style={styles.front}>{item.front}</Text>
            {(phase === "prompt" || phase === "error") && (
                <>
                    <TextInput
                        style={styles.input}
                        multiline
                        value={typed}
                        onChangeText={setTyped}
                        placeholder="Describe it from memory…"
                        editable={phase !== "error"}
                    />
                    {phase === "error" && (
                        <View style={styles.errorBox}>
                            <Text style={styles.error}>
                                Grading failed: {gradeError}
                            </Text>
                            <Button
                                title="Retry grading"
                                onPress={() => submit(gaveUp)}
                            />
                        </View>
                    )}
                    {phase === "prompt" && (
                        <View style={styles.row}>
                            <Button
                                title="Submit"
                                onPress={() => submit(false)}
                            />
                            <Button
                                title="I don't know"
                                onPress={() => submit(true)}
                            />
                        </View>
                    )}
                </>
            )}
            {phase === "grading" && (
                <View style={styles.grading}>
                    <ActivityIndicator />
                    <Text style={styles.gradingText}>Grading…</Text>
                </View>
            )}
            {phase === "graded" && (
                <View style={styles.feedbackBox}>
                    <Text style={styles.verdict}>{verdictLabel}</Text>
                    {feedback !== "" && (
                        <Text style={styles.llmNote}>{feedback}</Text>
                    )}
                    <Text style={styles.back}>{item.back}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { gap: 10 },
    leaf: { fontSize: 12, color: "#888" },
    front: { fontSize: 17, fontWeight: "600", lineHeight: 24 },
    input: {
        borderWidth: 1,
        borderColor: "#8886",
        borderRadius: 10,
        padding: 12,
        minHeight: 90,
        textAlignVertical: "top",
        fontSize: 15,
    },
    row: { flexDirection: "row", gap: 12, justifyContent: "space-between" },
    grading: { flexDirection: "row", gap: 10, alignItems: "center" },
    gradingText: { color: "#777" },
    errorBox: { gap: 8 },
    error: { color: "#c0392b" },
    feedbackBox: { gap: 8 },
    verdict: { fontWeight: "800", fontSize: 16 },
    llmNote: { fontStyle: "italic", color: "#555" },
    back: { lineHeight: 21 },
});
```

- [ ] **Step 3: Study screen**

Replace `app/study.tsx`:

```tsx
import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Button, ScrollView, StyleSheet, Text, View } from "react-native";

import { getMcatStudyQueue } from "../src/api/client";
import { useConnection } from "../src/api/ConnectionContext";
import { ErrorBanner } from "../src/components/ErrorBanner";
import { McqCard } from "../src/components/McqCard";
import { TypedFlashcard } from "../src/components/TypedFlashcard";
import type { McatStudyItem } from "../src/gen/anki/scheduler_pb";
import { McatStudyItem_Kind } from "../src/gen/anki/scheduler_pb";

export default function Study() {
    const { config, ready, unpair } = useConnection();
    const [items, setItems] = useState<McatStudyItem[] | null>(null);
    const [index, setIndex] = useState(0);
    const [answered, setAnswered] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!config) {
            return;
        }
        setError("");
        setItems(null);
        setIndex(0);
        setCorrectCount(0);
        setAnswered(false);
        try {
            const resp = await getMcatStudyQueue(config, { sessionSize: 0 });
            setItems(resp.items);
        } catch {
            setError("Couldn't load the study queue.");
        }
    }, [config]);

    useEffect(() => {
        load();
    }, [load]);

    if (!ready) {
        return null;
    }
    if (!config) {
        return <Redirect href="/pair" />;
    }

    const item = items?.[index];
    const done = items !== null && index >= items.length;

    function next(): void {
        setAnswered(false);
        setIndex((i) => i + 1);
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {error !== "" && (
                <ErrorBanner
                    message={error}
                    onRetry={load}
                    onRepair={async () => {
                        await unpair();
                        router.replace("/pair");
                    }}
                />
            )}
            {items === null && error === "" && <Text>Loading queue…</Text>}
            {items !== null && items.length === 0 && (
                <Text>Nothing to study right now — come back later.</Text>
            )}
            {item && (
                <>
                    <Text style={styles.progress}>
                        {index + 1} / {items!.length}
                    </Text>
                    {item.kind === McatStudyItem_Kind.MCQ
                        ? (
                            <McqCard
                                key={item.cardId.toString()}
                                item={item}
                                config={config}
                                showFeedback
                                onAnswered={(correct) => {
                                    if (correct) {
                                        setCorrectCount((c) => c + 1);
                                    }
                                    setAnswered(true);
                                }}
                            />
                        )
                        : (
                            <TypedFlashcard
                                key={item.cardId.toString()}
                                item={item}
                                config={config}
                                onGraded={() => setAnswered(true)}
                            />
                        )}
                    {answered && <Button title="Next" onPress={next} />}
                </>
            )}
            {done && items!.length > 0 && (
                <View style={styles.summary}>
                    <Text style={styles.summaryHead}>Session complete</Text>
                    <Text>
                        {correctCount} MCQ{correctCount === 1 ? "" : "s"}{" "}
                        correct out of{" "}
                        {items!.filter((i) => i.kind === McatStudyItem_Kind.MCQ)
                            .length}
                    </Text>
                    <Button
                        title="Back to dashboard"
                        onPress={() => router.back()}
                    />
                    <Button title="New session" onPress={load} />
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 14 },
    progress: { color: "#888", fontWeight: "600" },
    summary: { gap: 10, alignItems: "flex-start" },
    summaryHead: { fontSize: 20, fontWeight: "800" },
});
```

- [ ] **Step 4: Typecheck + tests**

```powershell
npx tsc --noEmit
npm test
```

Expected: pass.

- [ ] **Step 5: On-device verification**

With desktop server running: answer at least one MCQ (feedback + explanation shows, desktop review count changes), one typed flashcard (spinner → verdict + LLM feedback — this proves the 90s grading path), one card with an image (image renders — proves authed media GET), and one "I don't know" on each kind. Kill the desktop server mid-session and submit → error surfaced with Retry; restart server → Retry succeeds.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: mobile study session with MCQs, typed grading, images"
```

---

### Task 12: Diagnostic screen

**Files:**

- Replace: `app/diagnostic.tsx`

**Interfaces:**

- Consumes: `getMcatDiagnostic`, `computeMcatReadiness`, `recomputeMcatLeafStates` (Task 8); `McqCard` with `showFeedback={false}` (Task 11); `useConnection`, `ErrorBanner` (Task 9).

Behavior contract (mirrors `ts/routes/mcat/diagnostic/`): intro (count choice, `questionCount: 0` = backend default 120, `seed: 0n`) with pre-exam readiness snapshot → exam (MCQs, **no per-question feedback**, answers submitted as you go) → results (`recomputeMcatLeafStates` once at the end; show correct count, per-section tallies, and before → after readiness delta).

- [ ] **Step 1: Implement the screen**

Replace `app/diagnostic.tsx`:

```tsx
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Button, ScrollView, StyleSheet, Text, View } from "react-native";

import {
    computeMcatReadiness,
    getMcatDiagnostic,
    recomputeMcatLeafStates,
} from "../src/api/client";
import { useConnection } from "../src/api/ConnectionContext";
import { ErrorBanner } from "../src/components/ErrorBanner";
import { McqCard } from "../src/components/McqCard";
import type {
    McatReadinessResponse,
    McatStudyItem,
} from "../src/gen/anki/scheduler_pb";

type Phase = "intro" | "exam" | "submitting" | "results";

const COUNT_CHOICES = [
    { label: "Quick (20)", count: 20 },
    { label: "Half (60)", count: 60 },
    { label: "Full (120)", count: 0 }, // 0 = backend default of 120
];

export default function Diagnostic() {
    const { config, ready, unpair } = useConnection();
    const [phase, setPhase] = useState<Phase>("intro");
    const [items, setItems] = useState<McatStudyItem[]>([]);
    const [index, setIndex] = useState(0);
    const [answered, setAnswered] = useState(false);
    const [tallies, setTallies] = useState(
        new Map<string, { correct: number; total: number }>(),
    );
    const [before, setBefore] = useState<McatReadinessResponse | null>(null);
    const [after, setAfter] = useState<McatReadinessResponse | null>(null);
    const [error, setError] = useState("");

    async function begin(count: number): Promise<void> {
        if (!config) {
            return;
        }
        setError("");
        try {
            const [diag, snapshot] = await Promise.all([
                getMcatDiagnostic(config, { questionCount: count, seed: 0n }),
                computeMcatReadiness(config, {}),
            ]);
            if (diag.items.length === 0) {
                setError(
                    "No MCAT questions found — import content on the desktop first.",
                );
                return;
            }
            setBefore(snapshot);
            setItems(diag.items);
            setIndex(0);
            setAnswered(false);
            setTallies(new Map());
            setPhase("exam");
        } catch {
            setError("Couldn't start the diagnostic.");
        }
    }

    function recordAnswer(item: McatStudyItem, correct: boolean): void {
        setTallies((prev) => {
            const nextMap = new Map(prev);
            const t = nextMap.get(item.section) ?? { correct: 0, total: 0 };
            nextMap.set(item.section, {
                correct: t.correct + (correct ? 1 : 0),
                total: t.total + 1,
            });
            return nextMap;
        });
        setAnswered(true);
    }

    async function next(): Promise<void> {
        if (index + 1 < items.length) {
            setAnswered(false);
            setIndex(index + 1);
            return;
        }
        setPhase("submitting");
        setError("");
        try {
            setAfter(await recomputeMcatLeafStates(config!, {}));
            setPhase("results");
        } catch {
            setError(
                "Couldn't compute results — check the connection and try again.",
            );
            // Stay in "submitting" (NOT "exam"): reverting to the exam phase
            // remounts the already-answered last card as answerable, so a tap
            // would submit a duplicate grade + inflate the tally. The error
            // banner's Retry re-runs next() to re-attempt scoring.
        }
    }

    if (!ready) {
        return null;
    }
    if (!config) {
        return <Redirect href="/pair" />;
    }

    const item = items[index];
    const totals = [...tallies.values()].reduce(
        (acc, t) => ({
            correct: acc.correct + t.correct,
            total: acc.total + t.total,
        }),
        { correct: 0, total: 0 },
    );

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {error !== "" && (
                <ErrorBanner
                    message={error}
                    onRetry={phase === "intro" ? undefined : next}
                    onRepair={async () => {
                        await unpair();
                        router.replace("/pair");
                    }}
                />
            )}
            {phase === "intro" && (
                <View style={styles.intro}>
                    <Text style={styles.head}>Diagnostic exam</Text>
                    <Text style={styles.body}>
                        Blueprint-stratified MCQs across all sections. No
                        feedback until the end — it calibrates your readiness
                        score.
                    </Text>
                    {COUNT_CHOICES.map((c) => (
                        <Button
                            key={c.label}
                            title={c.label}
                            onPress={() => begin(c.count)}
                        />
                    ))}
                </View>
            )}
            {phase === "exam" && item && (
                <>
                    <Text style={styles.progress}>
                        {index + 1} / {items.length}
                    </Text>
                    <McqCard
                        key={item.cardId.toString()}
                        item={item}
                        config={config}
                        showFeedback={false}
                        onAnswered={(correct) => recordAnswer(item, correct)}
                    />
                    {answered && (
                        <Button
                            title={index + 1 < items.length ? "Next" : "Finish"}
                            onPress={next}
                        />
                    )}
                </>
            )}
            {phase === "submitting" && error === "" && <Text>Scoring…</Text>}
            {phase === "results" && after && (
                <View style={styles.results}>
                    <Text style={styles.head}>Results</Text>
                    <Text style={styles.bigline}>
                        {totals.correct} / {totals.total} correct
                    </Text>
                    {[...tallies.entries()].map(([section, t]) => (
                        <Text key={section} style={styles.body}>
                            {section}: {t.correct} / {t.total}
                        </Text>
                    ))}
                    {before && (
                        <Text style={styles.delta}>
                            Readiness: {before.readinessScore} →{" "}
                            {after.readinessScore} / 528
                        </Text>
                    )}
                    <Button
                        title="Back to dashboard"
                        onPress={() => router.back()}
                    />
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 14 },
    intro: { gap: 12 },
    head: { fontSize: 22, fontWeight: "800" },
    body: { lineHeight: 21 },
    progress: { color: "#888", fontWeight: "600" },
    results: { gap: 10, alignItems: "flex-start" },
    bigline: { fontSize: 28, fontWeight: "900" },
    delta: { fontWeight: "700", marginTop: 6 },
});
```

- [ ] **Step 2: Typecheck + tests**

```powershell
npx tsc --noEmit
npm test
```

Expected: pass.

- [ ] **Step 3: On-device verification**

Run a "Quick (20)" diagnostic end-to-end: no feedback during the exam, results show tallies and the before → after readiness delta, and the desktop dashboard's readiness matches the phone's "after" value on next refresh.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "feat: mobile diagnostic exam with results and readiness delta"
```

---

### Task 13: Final end-to-end verification + README

**Files:**

- Create: `README.md` (in `mcat-mobile`)

**Interfaces:**

- Consumes: everything above.

- [ ] **Step 1: Write the README**

Create `README.md`:

```markdown
# MCAT Mobile

React Native (Expo Go) frontend for the MCATspeedrun desktop app. The phone is
a thin client: all data and scheduling lives in the desktop's Rust backend.

## Running

1. Desktop: launch MCATspeedrun (`run.bat` in the repo), open the MCAT
   dashboard, press **Phone access**. Leave the modal's server running.
   Allow Python through Windows Firewall (private networks) if prompted.
2. Phone: install **Expo Go**, join the same Wi-Fi as the desktop.
3. Here: `npm install && npm run gen:proto && npx expo start`, then scan the
   terminal QR with Expo Go.
4. In the app, scan the desktop modal's QR (or paste the pairing code).

## Development

- `npm test` — unit tests (pairing + API client)
- `npm run gen:proto` — regenerate protobuf classes after the desktop's
  `proto/` changes (reads `../MCATspeedrun/proto`)
- API contract: `POST http://<desktop>:8045/_anki/<method>`, body/response are
  binary protobuf, `Authorization: Bearer <token>` required; only the MCAT
  RPCs and media GETs are allowed over the LAN.

## Troubleshooting

- "Couldn't reach the desktop": server not running (reopen Phone access),
  phone on cellular, or Windows Firewall blocking inbound 8045.
- 401/403 after it used to work: re-pair (desktop token was cleared or you
  switched desktop profiles).
- iOS: accept the Local Network permission prompt on first connect.
```

- [ ] **Step 2: Full on-device checklist**

Desktop running with LAN server on; phone in Expo Go:

1. Fresh pair via QR scan → dashboard loads with real readiness.
2. Paste-code pairing also works (Re-pair via error banner, or clear app data).
3. Study: MCQ answer + explanation; typed flashcard graded by LLM; image card renders; "I don't know" paths.
4. Diagnostic: quick run end-to-end with readiness delta.
5. Desktop stopped mid-use → banner with Retry/Re-pair; Retry recovers after restart.
6. Desktop `.\check` (full gate) passes in the MCATspeedrun repo; `npm test` + `npx tsc --noEmit` pass in mcat-mobile.
7. Security spot-check from a laptop on the same Wi-Fi (or PowerShell, Task 5 commands): no token → 403; non-MCAT method with token → 403.

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs: setup, pairing, and troubleshooting"
```
