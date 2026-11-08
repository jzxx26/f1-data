"""Gap-to-leader history for the gap chart and the driver focus trend.

F1 sends the current gaps only, so the backend keeps a sample of every car's
time behind the leader every ``step_s`` seconds of *feed* time (the replay's
recorded clock, or the wall clock live). Gaps come from
``pit_strategy.race_order``: ``GapToLeader``, then intervals chained for lapped
cars, and nothing for a car in the pit lane or without a gap.
"""

from __future__ import annotations

import threading
from collections import deque

import pandas as pd

from .adapter import LiveDataProcessor as P
from .formatting import is_race_session
from .pit_strategy import race_order

STEP_S = 2.0
# Six hours at one sample per two seconds: longer than any session.
MAX_SAMPLES = 10_800


class GapHistory:
    def __init__(self, step_s: float = STEP_S, max_samples: int = MAX_SAMPLES) -> None:
        self.step_s = step_s
        self.samples: deque[dict] = deque(maxlen=max_samples)
        self.lock = threading.Lock()
        self._last: pd.Timestamp | None = None

    def clear(self) -> None:
        with self.lock:
            self.samples.clear()
            self._last = None

    def due(self, moment: pd.Timestamp) -> bool:
        return self._last is None or (moment - self._last).total_seconds() >= self.step_s

    def maybe_sample(self, adapter, moment: pd.Timestamp | None) -> bool:
        """Take a sample if ``step_s`` of feed time has passed. Races and sprints only."""
        if moment is None or not self.due(moment):
            return False
        timing = adapter.state.get("TimingData")
        info = adapter.state.get("SessionInfo") or {}
        if not timing or not is_race_session({"session_type": info.get("Type"), "session_name": info.get("Name")}):
            return False
        acronyms = P.acronyms_from_state(adapter.state.get("DriverList"))
        standings = P.standings_from_state(timing, acronyms, race=True)
        gaps = {e.driver: e.gap for e in race_order(standings) if e.gap is not None}
        if not gaps:
            return False
        lap = (adapter.state.get("LapCount") or {}).get("CurrentLap")
        with self.lock:
            self.samples.append({"t": moment, "lap": lap, "gaps": gaps})
            self._last = moment
        return True

    def series(self, drivers: list[str], minutes: float | None = None) -> dict:
        """``{"t": [s before the last sample], "lap": [...], "gaps": {code: [s or None]}}``."""
        with self.lock:
            samples = list(self.samples)
        if not samples:
            return {"t": [], "lap": [], "gaps": {}}
        end = samples[-1]["t"]
        if minutes:
            start = end - pd.to_timedelta(minutes * 60, unit="s")
            samples = [s for s in samples if s["t"] >= start]
        codes = drivers or sorted({code for s in samples for code in s["gaps"]})
        return {
            "t": [round((s["t"] - end).total_seconds(), 1) for s in samples],
            "lap": [s["lap"] for s in samples],
            "gaps": {code: [s["gaps"].get(code) for s in samples] for code in codes},
        }
