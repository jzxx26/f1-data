"""Display helpers the timing parsers use (copied from F1-Telemetry-Dashboard's processing.timing)."""

import pandas as pd

MISSING = "–"
LEADER = "LEADER"
RACE_SESSION_TYPES = {"r", "s", "race", "sprint"}


def format_delta(seconds: float | None) -> str:
    """Signed gap string, e.g. ``'+0.102'``; missing deltas render as an en dash."""
    if seconds is None or pd.isna(seconds):
        return MISSING
    return f"+{seconds:.3f}" if seconds >= 0 else f"{seconds:.3f}"


def format_lap_gap(laps_down: int) -> str:
    """``1`` -> ``'+1 LAP'``; ``3`` -> ``'+3 LAPS'`` (race convention)."""
    return f"+{laps_down} LAP" if laps_down == 1 else f"+{laps_down} LAPS"


def is_race_session(session_info: dict | None) -> bool:
    """True for races and sprints, which are classified by finishing order."""
    info = session_info or {}
    for key in ("session_type", "session_name"):
        value = info.get(key)
        if value and str(value).strip().lower() in RACE_SESSION_TYPES:
            return True
    return False
