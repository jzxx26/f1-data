"""Net pit loss measured from a circuit's past races (in-lap + out-lap method).

For each stop, the in-lap and the out-lap together take longer than two normal laps;
that excess is the net pit loss: pit lane time minus the track it bypasses, plus the
slow pit entry and the cold-tyre out-lap. The "normal lap" is the driver's own median
green-flag lap from the same race, within a few laps of the stop.

Stops are left out when either lap ran under anything but green (a safety car or VSC
makes a stop cheap), on lap 1, when the in-lap or out-lap has no time, or when the
result is outside a plausible range (drive-throughs, repairs, red-flag waits).

This is a measurement of past races, shown next to the slider as a reference. The
viewer still chooses the value the prediction uses.
"""

from __future__ import annotations

import json
import logging
import math
import threading
from pathlib import Path

import pandas as pd

log = logging.getLogger("f1api")

REFERENCE_WINDOW = 5  # laps either side of the stop that set the driver's normal pace
MIN_REFERENCE_LAPS = 3
MIN_LOSS_S = 8.0
MAX_LOSS_S = 45.0
YEARS_BACK = 3
CACHE_FILE = Path(__file__).resolve().parent.parent / "cache" / "circuit_pit_loss.json"
METHOD = (
    "In-lap + out-lap minus two of the driver's normal green-flag laps (median of laps "
    f"within {REFERENCE_WINDOW} of the stop). Stops under SC, VSC or yellow are excluded."
)


def _seconds(value) -> float | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, pd.Timedelta):
        return value.total_seconds()
    return float(value)


def _green(status) -> bool:
    """FastF1's per-lap TrackStatus holds every status seen on the lap; '1' alone is green."""
    if status is None or (isinstance(status, float) and math.isnan(status)):
        return False
    return set(str(status)) <= {"1"}


def stop_losses(laps: pd.DataFrame) -> list[dict]:
    """One row per measurable stop: driver, lap, loss in seconds."""
    rows: list[dict] = []
    if laps.empty:
        return rows
    for driver, own in laps.groupby("Driver"):
        own = own.sort_values("LapNumber").reset_index(drop=True)
        by_lap = {int(row.LapNumber): row for row in own.itertuples() if not pd.isna(row.LapNumber)}
        normal = {
            lap: _seconds(row.LapTime)
            for lap, row in by_lap.items()
            if lap > 1
            and _green(row.TrackStatus)
            and pd.isna(row.PitInTime)
            and pd.isna(row.PitOutTime)
            and _seconds(row.LapTime) is not None
        }
        for lap, row in by_lap.items():
            if pd.isna(row.PitInTime) or lap <= 1:
                continue
            out = by_lap.get(lap + 1)
            if out is None or pd.isna(out.PitOutTime):
                continue
            in_time, out_time = _seconds(row.LapTime), _seconds(out.LapTime)
            if in_time is None or out_time is None:
                continue
            if not (_green(row.TrackStatus) and _green(out.TrackStatus)):
                continue
            reference = [t for n, t in normal.items() if abs(n - lap) <= REFERENCE_WINDOW + 1]
            if len(reference) < MIN_REFERENCE_LAPS:
                continue
            typical = float(pd.Series(reference).median())
            loss = in_time + out_time - 2 * typical
            if MIN_LOSS_S <= loss <= MAX_LOSS_S:
                rows.append({"driver": str(driver), "lap": lap, "loss": round(loss, 3)})
    return rows


def summarise(losses: list[float]) -> dict | None:
    if not losses:
        return None
    series = pd.Series(losses)
    return {
        "median": round(float(series.median()), 1),
        "p25": round(float(series.quantile(0.25)), 1),
        "p75": round(float(series.quantile(0.75)), 1),
        "stops": len(losses),
    }


def _load_race_laps(year: int, event: str) -> pd.DataFrame | None:
    import fastf1

    try:
        session = fastf1.get_session(year, event, "R")
        if event.lower() not in str(session.event["EventName"]).lower() and str(
            session.event["Location"]
        ).lower() not in event.lower():
            return None  # fuzzy matching picked another race: this one did not exist that year
        session.load(laps=True, telemetry=False, weather=False, messages=False)
        return session.laps
    except Exception as exc:  # no such race that year, or the archive refused
        log.info("No pit-loss history for %s %s: %s", year, event, exc)
        return None


_lock = threading.Lock()


def _read_cache() -> dict:
    try:
        return json.loads(CACHE_FILE.read_text())
    except (OSError, ValueError):
        return {}


def historical_net_loss(event: str, before_year: int, loader=_load_race_laps) -> dict:
    """Net pit loss at ``event`` over the ``YEARS_BACK`` seasons before ``before_year``.

    Cached on disk per event and seasons: past races do not change.
    """
    years = list(range(before_year - YEARS_BACK, before_year))
    key = f"{event}|{years[0]}-{years[-1]}"
    with _lock:
        cached = _read_cache()
        if key in cached:
            return cached[key]
        per_year = []
        all_losses: list[float] = []
        loaded = 0
        for year in years:
            laps = loader(year, event)
            if laps is None:
                continue
            loaded += 1  # a wet or red-flagged race can load fine and still give no green-flag stop
            losses = [row["loss"] for row in stop_losses(laps)]
            if losses:
                per_year.append({"year": year, **summarise(losses)})
                all_losses.extend(losses)
        result = {
            "event": event,
            "years": [row["year"] for row in per_year],
            "overall": summarise(all_losses),
            "per_year": per_year,
            "method": METHOD,
        }
        # Only a complete answer is kept: a refused archive request is retried next time.
        if loaded == len(years):
            cached[key] = result
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            CACHE_FILE.write_text(json.dumps(cached, indent=1))
        return result
