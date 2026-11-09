"""What the next laps hold, from the race-pace model (roadmap #25, #26, #16).

* **Gap projection** (#25): the gap to the car ahead and behind lap by lap, if both run
  at the pace the model expects for their car, tyre and fuel.
* **Catch ETA** (#26): the lap the chasing car gets within ``MOM_RANGE_S`` (the 2026
  overtake-mode range, which replaced DRS) and the lap it would draw level. Getting
  close is not passing: the projection stops at "level" and says so.
* **Pit window** (#16): for one more stop, the lap that finishes the race soonest on each
  compound the model has seen, against staying out, with the net pit loss the viewer set.
  It is about time only: where the car rejoins is the Pit rejoin card's job.

Straight-line wear, no traffic, no safety car: these are projections of the model, not
forecasts of the race, and the labels say so.
"""

from __future__ import annotations

import pandas as pd

from .pit_strategy import race_order

MOM_RANGE_S = 1.0
HORIZON_LAPS = 5


def _terms(model: dict):
    deg = {c["compound"]: c["deg_s_per_lap"] for c in model.get("compounds", [])}
    offset = {c["compound"]: c["offset_s"] for c in model.get("compounds", [])}
    fuel = (model.get("fuel") or {}).get("s_per_lap") or 0.0
    return deg, offset, fuel


def expected_lap(model: dict, driver: str, compound: str, tyre_age: float, lap: int) -> float | None:
    """Model lap time for ``driver`` on ``compound`` at ``tyre_age`` laps, on race lap ``lap``."""
    deg, offset, fuel = _terms(model)
    row = next((d for d in model.get("drivers", []) if d["driver"] == driver), None)
    if row is None or row.get("pace_s") is None or compound not in deg:
        return None
    return row["pace_s"] + (offset.get(compound) or 0.0) + deg[compound] * tyre_age + fuel * lap


def _now(model: dict, driver: str) -> tuple[str, float] | None:
    row = next((d for d in model.get("drivers", []) if d["driver"] == driver), None)
    if row is None or not row.get("compound") or row.get("tyre_age") is None:
        return None
    return row["compound"], float(row["tyre_age"])


def _rate(model: dict, chaser: str, leader: str, lap: int, k: int) -> float | None:
    """Seconds the chaser gains on lap ``lap + k`` (negative: it loses)."""
    a, b = _now(model, chaser), _now(model, leader)
    if a is None or b is None:
        return None
    mine = expected_lap(model, chaser, a[0], a[1] + k, lap + k)
    theirs = expected_lap(model, leader, b[0], b[1] + k, lap + k)
    return None if mine is None or theirs is None else theirs - mine


def chase(model: dict, chaser: str, leader: str, gap: float | None, lap: int, laps_left: int) -> dict:
    """The chaser's gap to ``leader`` over the coming laps, and when it closes."""
    out = {"chaser": chaser, "leader": leader, "gap": None if gap is None else round(gap, 3), "per_lap": None, "projected": [], "mom_lap": None, "level_lap": None}
    if gap is None or laps_left <= 0:
        return out
    first = _rate(model, chaser, leader, lap, 1)
    if first is None:
        return out
    out["per_lap"] = round(first, 3)
    running = gap
    for k in range(1, laps_left + 1):
        gain = _rate(model, chaser, leader, lap, k)
        if gain is None:
            break
        running -= gain
        if k <= HORIZON_LAPS:
            out["projected"].append({"lap": lap + k, "gap": round(running, 3)})
        if out["mom_lap"] is None and running <= MOM_RANGE_S < gap:
            out["mom_lap"] = lap + k
        if running <= 0:
            out["level_lap"] = lap + k
            break
    if gap <= MOM_RANGE_S:
        out["mom_lap"] = lap  # already in range
    return out


def neighbours(model: dict, standings: pd.DataFrame, driver: str, lap: int, total_laps: int | None) -> dict:
    """Projection against the car ahead and the car behind on the road order."""
    order = race_order(standings)
    codes = [e.driver for e in order]
    if driver not in codes:
        return {"ahead": None, "behind": None}
    i = codes.index(driver)
    laps_left = max((total_laps or lap) - lap, 0)

    def gap_between(front: int, back: int) -> float | None:
        a, b = order[front].gap, order[back].gap
        if a is None or b is None or order[back].source == "stopped":
            return None
        return b - a

    ahead = chase(model, driver, codes[i - 1], gap_between(i - 1, i), lap, laps_left) if i > 0 else None
    behind = None
    if i + 1 < len(order) and order[i + 1].source != "stopped":
        behind = chase(model, codes[i + 1], driver, gap_between(i, i + 1), lap, laps_left)
    return {"ahead": ahead, "behind": behind}


def _stint_time(model: dict, driver: str, compound: str, age: float, first_lap: int, laps: int) -> float | None:
    total = 0.0
    for k in range(laps):
        t = expected_lap(model, driver, compound, age + k, first_lap + k)
        if t is None:
            return None
        total += t
    return total


def pit_window(model: dict, driver: str, lap: int, total_laps: int | None, net_loss: float) -> dict:
    """Best lap for one more stop on each compound vs running to the flag.

    ``lap`` is the lap just completed; a stop "on lap s" means the in-lap is lap s and the
    new tyres start on lap s + 1 (age 1 on their first lap, as the feed counts it).
    """
    out = {"driver": driver, "laps_left": None, "net_loss": net_loss, "options": [], "reason": None}
    now = _now(model, driver)
    if total_laps is None:
        return {**out, "reason": "The total lap count is not known yet."}
    laps_left = total_laps - lap
    out["laps_left"] = laps_left
    if now is None or laps_left <= 1:
        return {**out, "reason": "No pace for this car yet." if now is None else "The race is ending."}
    compound, age = now
    stay = _stint_time(model, driver, compound, age + 1, lap + 1, laps_left)
    if stay is None:
        return {**out, "reason": "No pace for this car yet."}
    deg, offset, _ = _terms(model)
    for new in deg:
        if new != compound and offset.get(new) is None:
            continue  # its offset to the current compound is not measured: no fair comparison
        best = None
        for s in range(lap + 1, total_laps):  # pit at the end of lap s (at least one lap on new tyres)
            before = s - lap
            old = _stint_time(model, driver, compound, age + 1, lap + 1, before)
            fresh = _stint_time(model, driver, new, 1, s + 1, total_laps - s)
            if old is None or fresh is None:
                continue
            total = old + net_loss + fresh
            if best is None or total < best[1]:
                best = (s, total)
        if best is None:
            continue
        out["options"].append(
            {
                "compound": new,
                "best_lap": best[0],
                "gain_vs_stay": round(stay - best[1], 2),  # positive: the stop is quicker overall
            }
        )
    out["options"].sort(key=lambda o: -o["gain_vs_stay"])
    out["stay_out_wins"] = all(o["gain_vs_stay"] <= 0 for o in out["options"]) if out["options"] else None
    return out

