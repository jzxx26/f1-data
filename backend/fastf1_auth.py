"""Let FastF1 use your F1TV subscription token for the timing archive.

Since late 2026 livetiming.formula1.com/static answers 401 without a token, so
FastF1 loads no laps, weather or telemetry for any session that is not already
in the cache (results still arrive from Ergast, which is why the archive showed
a classification and nothing else). FastF1 3.9 attaches a stored subscription
token as ``Authorization: Bearer`` to those requests and only tries an
F1-account sign-in when it has none.

This puts the token from ``F1TV_SUBSCRIPTION_TOKEN`` (backend/.env) into
FastF1's token manager **in memory only**: it is never written to FastF1's
token file. ``fastf1.internals`` is private API, so this is the one place that
touches it, and tests/test_fastf1_auth.py pins the behaviour.
"""

from __future__ import annotations

import logging
import os
import time

log = logging.getLogger("f1api.auth")


def use_f1tv_token_for_fastf1() -> str:
    """Hand the F1TV token to FastF1. Returns what happened, for the startup log."""
    from live.signalr_core import token_from_env_value

    token = token_from_env_value(os.environ.get("F1TV_SUBSCRIPTION_TOKEN", ""))
    if not token:
        return "no F1TV token: FastF1 can only load sessions already in the cache"
    try:
        from fastf1.internals.f1account import SubscriptionToken, token_manager
    except ImportError:
        return "this FastF1 version has no token manager: archive downloads stay unauthenticated"
    try:
        subscription = SubscriptionToken.from_jwt(token)
    except Exception:  # FastF1 raises its own error type for a malformed token
        return "the F1TV token is not a valid JWT: archive downloads stay unauthenticated"
    if not subscription.is_valid():
        return "the F1TV token has expired: renew F1TV_SUBSCRIPTION_TOKEN in backend/.env"
    token_manager._token = subscription  # memory only; no file is written
    days = (subscription.expires_at - time.time()) / 86_400
    return f"FastF1 uses the F1TV token for the timing archive ({days:.1f} days left)"
