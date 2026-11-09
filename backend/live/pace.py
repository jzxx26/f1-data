"""Race pace: clean laps, tyre degradation, fuel effect and each driver's underlying pace.

One least-squares model over every clean lap of the race:

    lap time = driver pace + compound offset + degradation[compound] x tyre age
               + fuel effect x lap number

* **Clean laps** (roadmap #9): green flag for the whole lap, no pit entry or exit in it,
  not lap 1, not within ``TRAFFIC_S`` of the car ahead at the line, and not slower than
  ``SLOW_LAP`` x the driver's median (a mistake or a lift). Then laps the model misses by
  more than three robust standard deviations are dropped and the model refitted once.
* **Fuel effect** (#8) is measured, not assumed: lap number and tyre age only separate
  once cars have changed tyres. Until then the fit has no fuel term and the degradation
  figure says it includes the fuel burning off (so it reads lower than the tyre alone).
* **Degradation** (#7): seconds per lap of tyre age, per compound, straight line.
* **Underlying pace** (#28): the driver term, so the order is free of tyre age, compound
  and fuel. **Trend** (#12): how far the last laps sit from what the model expects for
  that car; negative is quicker than expected.

Everything here is a pure function of a lap table, so the live feed and FastF1's
archive (``history_lap_table``) use the same code.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .time_utils import to_seconds

TRAFFIC_S = 1.5
SLOW_LAP = 1.07
MIN_DRIVER_LAPS = 3
MIN_COMPOUND_LAPS = 15  # fewer laps than this on a compound cannot give it a degradation slope
RECENT_LAPS = 5
OUTLIER_SIGMA = 3.0
# A fuel figure is reported only when the laps pin it down this tightly (standard error, s/lap).
FUEL_MAX_SE = 0.015

LAP_COLUMNS = ["Driver", "Lap", "LapTime", "Compound", "TyreAge", "Stint", "PitLap", "Green", "IntervalAhead"]

METHOD = (
    "Least squares over clean laps: lap time = driver pace + compound offset + "
    "degradation x tyre age + fuel effect x lap. Clean: green flag all lap, no pit entry "
    f"or exit, not lap 1, more than {TRAFFIC_S:g} s behind the car ahead, within "
    f"{(SLOW_LAP - 1) * 100:.0f}% of the driver's median."
)


# ── Lap tables ───────────────────────────────────────────────────────────────


def _status_at(timeline: list[tuple[pd.Timestamp | None, str]], moment: pd.Timestamp) -> str | None:
    status = None
    for stamp, value in timeline:
        if stamp is None or stamp <= moment:
            status = value
        else:
            break
    return status


def _green_between(timeline, start, end) -> bool:
    """Green from ``start`` to ``end``: green at the start and no other status inside."""
    if start is None or end is None:
        return False
    if _status_at(timeline, start) != "1":
        return False
    return all(value == "1" for stamp, value in timeline if stamp is not None and start < stamp <= end)


def live_lap_table(
    laps: list[dict],
    pit_events: list[dict],
    track_timeline: list[tuple[str | None, str]],
    acronyms: dict[str, str],
) -> pd.DataFrame:
    """The adapter's recorded laps as a lap table.

    A lap runs from the driver's previous line crossing to this one; the first lap
    seen for a driver has no known start, so it is never counted as clean.
    """
    if not laps:
        return pd.DataFrame(columns=LAP_COLUMNS)
    timeline = sorted(
        ((None if s is None else pd.Timestamp(s), v) for s, v in track_timeline),
        key=lambda item: (item[0] is not None, item[0] or pd.Timestamp(0, tz="UTC")),
    )
    pits: dict[str, list[pd.Timestamp]] = {}
    for event in pit_events:
        if event.get("Utc"):
            pits.setdefault(str(event["driver_number"]), []).append(pd.Timestamp(event["Utc"]))

    rows = []
    frame = pd.DataFrame(laps)
    for number, own in frame.groupby("driver_number"):
        own = own.sort_values("LapNumber")
        previous_end, previous_lap = None, None
        for row in own.itertuples():
            end = pd.Timestamp(row.Utc) if isinstance(row.Utc, str) else None
            start = previous_end if previous_lap == row.LapNumber - 1 else None
            stops = pits.get(str(number), [])
            pit_lap = start is None or end is None or any(start < t <= end for t in stops)
            rows.append(
                {
                    "Driver": acronyms.get(str(number), str(number)),
                    "Lap": int(row.LapNumber),
                    "LapTime": to_seconds(row.LapTime),
                    "Compound": getattr(row, "Compound", None),
                    "TyreAge": _number(getattr(row, "TyreAge", None)),
                    "Stint": _number(getattr(row, "Stint", None)),
                    "PitLap": bool(pit_lap),
                    "Green": _green_between(timeline, start, end),
                    "IntervalAhead": _interval(getattr(row, "IntervalAhead", None)),
                }
            )
            previous_end, previous_lap = end, row.LapNumber
    return pd.DataFrame(rows, columns=LAP_COLUMNS)


def history_lap_table(laps: pd.DataFrame) -> pd.DataFrame:
    """FastF1 ``session.laps`` as a lap table (gap ahead from line-crossing times)."""
    if laps is None or laps.empty:
        return pd.DataFrame(columns=LAP_COLUMNS)
    frame = laps.copy()
    frame["_end"] = frame["Time"].dt.total_seconds()
    frame["IntervalAhead"] = np.nan
    for _, same_lap in frame.groupby("LapNumber"):
        ordered = same_lap.sort_values("_end")
        frame.loc[ordered.index, "IntervalAhead"] = ordered["_end"].diff().to_numpy()
    out = pd.DataFrame(
        {
            "Driver": frame["Driver"].astype(str),
            "Lap": frame["LapNumber"].astype("Int64"),
            "LapTime": frame["LapTime"].dt.total_seconds(),
            "Compound": frame["Compound"].astype(str).str.upper(),
            "TyreAge": pd.to_numeric(frame["TyreLife"], errors="coerce"),
            "Stint": pd.to_numeric(frame["Stint"], errors="coerce"),
            "PitLap": frame["PitInTime"].notna() | frame["PitOutTime"].notna(),
            "Green": frame["TrackStatus"].astype(str).map(lambda s: set(s) <= {"1"} and s != "nan"),
            "IntervalAhead": frame["IntervalAhead"],
        }
    )
    return out.dropna(subset=["Lap"]).reset_index(drop=True)


def _number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _interval(value) -> float | None:
    """'+0.512' -> 0.512; '' (leader) and '1 L' (lapped) -> None (not traffic)."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    text = str(value).strip().lstrip("+")
    if not text or "L" in text.upper():
        return None
    return to_seconds(text)


# ── Clean laps ───────────────────────────────────────────────────────────────


def clean_laps(table: pd.DataFrame, traffic_s: float = TRAFFIC_S) -> pd.DataFrame:
    """Laps that show the car's own pace."""
    if table.empty:
        return table
    t = table.copy()
    keep = (
        (t["Lap"] > 1)
        & t["Green"].astype(bool)
        & ~t["PitLap"].astype(bool)
        & t["LapTime"].notna()
        & t["Compound"].notna()
        & t["TyreAge"].notna()
        & ~t["Compound"].isin(["UNKNOWN", "TEST_UNKNOWN", "NONE", "NAN"])
    )
    traffic = t["IntervalAhead"].notna() & (t["IntervalAhead"] < traffic_s)
    t = t[keep & ~traffic]
    medians = t.groupby("Driver")["LapTime"].transform("median")
    return t[t["LapTime"] <= medians * SLOW_LAP].reset_index(drop=True)


# ── The model ────────────────────────────────────────────────────────────────


@dataclass
class _Design:
    matrix: np.ndarray
    names: list[str]


def _design(laps: pd.DataFrame, drivers: list[str], compounds: list[str], fuel: bool, offsets: bool) -> _Design:
    columns, names = [], []
    for driver in drivers:
        columns.append((laps["Driver"] == driver).to_numpy(float))
        names.append(f"driver:{driver}")
    for compound in compounds[1:] if offsets else []:  # first compound is the reference
        columns.append((laps["Compound"] == compound).to_numpy(float))
        names.append(f"offset:{compound}")
    for compound in compounds:
        columns.append(((laps["Compound"] == compound) * laps["TyreAge"]).to_numpy(float))
        names.append(f"deg:{compound}")
    if fuel:
        columns.append(laps["Lap"].to_numpy(float))
        names.append("fuel")
    return _Design(np.column_stack(columns), names)


def _standard_error(design: _Design, coef: np.ndarray, y: np.ndarray, index: int) -> float:
    residual = y - design.matrix @ coef
    dof = max(len(y) - len(coef), 1)
    variance = float(residual @ residual) / dof
    try:
        covariance = variance * np.linalg.inv(design.matrix.T @ design.matrix)
    except np.linalg.LinAlgError:
        return math.inf
    return math.sqrt(max(float(covariance[index, index]), 0.0))


def _solve(laps: pd.DataFrame, drivers, compounds):
    """Fit with as many terms as the laps can separate: fuel first to go, then offsets."""
    for fuel, offsets in ((True, True), (False, True), (True, False), (False, False)):
        design = _design(laps, drivers, compounds, fuel, offsets)
        if np.linalg.matrix_rank(design.matrix) < design.matrix.shape[1]:
            continue
        if design.matrix.shape[0] <= design.matrix.shape[1] + 2:
            continue
        y = laps["LapTime"].to_numpy(float)
        coef, *_ = np.linalg.lstsq(design.matrix, y, rcond=None)
        if fuel and _standard_error(design, coef, y, design.names.index("fuel")) > FUEL_MAX_SE:
            continue  # lap number and tyre age barely differ: no honest fuel figure yet
        return design, coef, fuel, offsets
    return None


def _trim(laps: pd.DataFrame) -> tuple[pd.DataFrame, list[str], list[str]]:
    """Keep compounds and drivers with enough laps to fit (compounds first: they remove laps)."""
    if laps.empty:
        return laps, [], []
    per_compound = laps["Compound"].value_counts()
    compounds = [c for c, n in per_compound.items() if n >= MIN_COMPOUND_LAPS]
    laps = laps[laps["Compound"].isin(compounds)]
    per_driver = laps.groupby("Driver").size()
    drivers = sorted(per_driver[per_driver >= MIN_DRIVER_LAPS].index)
    laps = laps[laps["Driver"].isin(drivers)].reset_index(drop=True)
    compounds = list(laps["Compound"].value_counts().index)
    return laps, drivers, compounds


def fit_pace(table: pd.DataFrame, traffic_s: float = TRAFFIC_S) -> dict:
    """The race-pace model for a lap table. Never raises on thin data: says why instead."""
    laps, drivers, compounds = _trim(clean_laps(table, traffic_s))
    base = {
        "laps_total": int(len(table)),
        "laps_used": 0,
        "traffic_s": traffic_s,
        "method": METHOD,
        "fuel": None,
        "compounds": [],
        "drivers": [],
        "sigma": None,
    }
    if len(drivers) < 2:
        return {**base, "status": "not_enough_laps", "reason": f"Needs {MIN_DRIVER_LAPS} clean laps from at least two cars."}

    for attempt in range(2):  # fit, drop laps the model misses badly, refit once
        solved = _solve(laps, drivers, compounds) if len(drivers) >= 2 else None
        if solved is None:
            return {**base, "status": "not_enough_laps", "reason": "The clean laps cannot separate the terms yet."}
        design, coef, _, _ = solved
        residual = laps["LapTime"].to_numpy(float) - design.matrix @ coef
        sigma = 1.4826 * float(np.median(np.abs(residual - np.median(residual))))
        keep = np.abs(residual) <= OUTLIER_SIGMA * max(sigma, 0.05)
        if keep.all() or attempt == 1:
            break
        laps, drivers, compounds = _trim(laps[keep])

    design, coef, fuel, offsets = solved
    terms = dict(zip(design.names, coef))
    fitted = design.matrix @ coef
    residual = laps["LapTime"].to_numpy(float) - fitted
    laps = laps.assign(Residual=residual)

    offset_of = {c: (terms.get(f"offset:{c}", 0.0) if offsets else None) for c in compounds}
    known = [v for v in offset_of.values() if v is not None]
    quickest = min(known) if known else 0.0
    compound_rows = [
        {
            "compound": c,
            "deg_s_per_lap": round(float(terms[f"deg:{c}"]), 3),
            "offset_s": None if offset_of[c] is None else round(float(offset_of[c] - quickest), 3),
            "laps": int((laps["Compound"] == c).sum()),
        }
        for c in compounds
    ]

    pace = {d: float(terms[f"driver:{d}"]) for d in drivers}
    best = min(pace.values())
    last_lap = int(table["Lap"].max())
    current = table.sort_values("Lap").groupby("Driver").tail(1).set_index("Driver")
    driver_rows = []
    for d in sorted(drivers, key=pace.get):
        own = laps[laps["Driver"] == d].sort_values("Lap")
        recent = own.tail(RECENT_LAPS)["Residual"]
        row = {
            "driver": d,
            "pace_delta": round(pace[d] - best, 3),
            "clean_laps": int(len(own)),
            "recent_vs_model": round(float(recent.mean()), 3) if len(recent) >= 3 else None,
            "compound": None,
            "tyre_age": None,
            "expected_lap": None,
        }
        if d in current.index:
            now = current.loc[d]
            compound = now["Compound"]
            row["compound"], row["tyre_age"] = compound, _number(now["TyreAge"])
            if compound in compounds and row["tyre_age"] is not None:
                expected = pace[d] + (offset_of[compound] or 0.0) + terms[f"deg:{compound}"] * (row["tyre_age"] + 1)
                expected += terms.get("fuel", 0.0) * (last_lap + 1)
                row["expected_lap"] = round(float(expected), 3)
        driver_rows.append(row)

    return {
        **base,
        "status": "ok",
        "laps_used": int(len(laps)),
        "fuel": {
            "identified": fuel,
            "s_per_lap": round(float(terms["fuel"]), 3) if fuel else None,
        },
        "offsets_identified": offsets,
        "compounds": compound_rows,
        "drivers": driver_rows,
        "sigma": round(float(1.4826 * np.median(np.abs(residual - np.median(residual)))), 3),
    }
