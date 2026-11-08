"""FastF1 gets the F1TV token in memory, and sends it to the timing archive."""

import sys
import time
from pathlib import Path

import jwt
import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastf1.internals.f1account import LivetimingAuthAdapter, token_manager  # noqa: E402

from fastf1_auth import use_f1tv_token_for_fastf1  # noqa: E402


def _token(expires_in: float) -> str:
    return jwt.encode({"exp": int(time.time() + expires_in), "subscriptionStatus": "active"}, "x")


@pytest.fixture(autouse=True)
def _clean(monkeypatch, tmp_path):
    # Never touch the real FastF1 token file.
    monkeypatch.setattr(token_manager, "_token_path", tmp_path / "f1auth_token.json")
    monkeypatch.setattr(token_manager, "_token", None)
    yield


def test_a_valid_token_is_used_in_memory_only(monkeypatch, tmp_path):
    token = _token(3 * 86_400)
    monkeypatch.setenv("F1TV_SUBSCRIPTION_TOKEN", token)

    message = use_f1tv_token_for_fastf1()

    assert "uses the F1TV token" in message
    assert token_manager.get_stored().value == token
    assert not (tmp_path / "f1auth_token.json").exists()


def test_the_archive_request_carries_the_bearer_token(monkeypatch):
    token = _token(3 * 86_400)
    monkeypatch.setenv("F1TV_SUBSCRIPTION_TOKEN", token)
    use_f1tv_token_for_fastf1()
    sent = {}

    def fake_send(self, request, **kwargs):
        sent["auth"] = request.headers.get("Authorization")
        response = requests.Response()
        response.status_code = 200
        return response

    monkeypatch.setattr(requests.adapters.HTTPAdapter, "send", fake_send)
    request = requests.Request("GET", "https://livetiming.formula1.com/static/x/Index.json").prepare()

    LivetimingAuthAdapter(token_manager).send(request)

    assert sent["auth"] == f"Bearer {token}"


def test_an_expired_token_is_not_installed(monkeypatch):
    monkeypatch.setenv("F1TV_SUBSCRIPTION_TOKEN", _token(-60))

    assert "expired" in use_f1tv_token_for_fastf1()
    assert token_manager.get_stored() is None


def test_no_token_says_only_the_cache_works(monkeypatch):
    monkeypatch.delenv("F1TV_SUBSCRIPTION_TOKEN", raising=False)

    assert "already in the cache" in use_f1tv_token_for_fastf1()
