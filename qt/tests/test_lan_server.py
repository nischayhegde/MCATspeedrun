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
