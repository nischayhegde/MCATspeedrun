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
