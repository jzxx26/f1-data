"""Roadmap #7, #8, #9, #12, #28: clean laps, degradation, fuel effect and underlying pace."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from live.adapter import LiveDataProcessor as P  # noqa: E402
from live.adapter import SignalRLiveAdapter  # noqa: E402
from live.pace import clean_laps, fit_pace, live_lap_table  # noqa: E402
from live.service import DEFAULT_REPLAY, Replay  # noqa: E402

DEG = {"MEDIUM": 0.08, "HARD": 0.04}
OFFSET = {"MEDIUM": 0.0, "HARD": 0.6}
FUEL = -0.06
PACE = {"AAA": 90.0, "BBB": 90.3, "CCC": 90.8}


def race(stop_lap=None, noise=0.0, seed=1):
    """Three cars, 40 laps, medium then hard; each pits on its own lap (or not at all)."""
    rng = np.random.default_rng(seed)
    rows = []
    stops = {"AAA": 15, "BBB": 20, "CCC": 25} if stop_lap is None else stop_lap
    for driver, base in PACE.items():
        stop = stops.get(driver)
        for lap in range(1, 41):
            on_hard = stop is not None and lap > stop
            compound = "HARD" if on_hard else "MEDIUM"
            age = lap - stop if on_hard else lap
            time = base + OFFSET[compound] + DEG[compound] * age + FUEL * lap + rng.normal(0, noise)
            rows.append(
                {
                    "Driver": driver,
                    "Lap": lap,
                    "LapTime": time,
                    "Compound": compound,
                    "TyreAge": float(age),
                    "Stint": 2.0 if on_hard else 1.0,
                    "PitLap": stop is not None and lap in (stop, stop + 1),
                    "Green": True,
                    "IntervalAhead": 3.0,
                }
            )
    return pd.DataFrame(rows)


def test_recovers_degradation_fuel_and_pace():
    result = fit_pace(race(noise=0.05))

    assert result["status"] == "ok"
    assert result["fuel"]["identified"]
    assert result["fuel"]["s_per_lap"] == pytest.approx(FUEL, abs=0.01)
    deg = {c["compound"]: c["deg_s_per_lap"] for c in result["compounds"]}
    assert deg["MEDIUM"] == pytest.approx(0.08, abs=0.01)
    assert deg["HARD"] == pytest.approx(0.04, abs=0.01)
    hard = next(c for c in result["compounds"] if c["compound"] == "HARD")
    assert hard["offset_s"] == pytest.approx(0.6, abs=0.1)
    assert [d["driver"] for d in result["drivers"]] == ["AAA", "BBB", "CCC"]
    assert result["drivers"][2]["pace_delta"] == pytest.approx(0.8, abs=0.05)


def test_before_any_stop_the_fuel_effect_is_not_claimed():
    """One stint each: tyre age and lap number move together, so they cannot be told apart."""
    result = fit_pace(race(stop_lap={}, noise=0.05))

    assert result["status"] == "ok"
    assert result["fuel"] == {"identified": False, "s_per_lap": None}
    # degradation then carries the fuel burn: 0.08 tyre - 0.06 fuel
    assert result["compounds"][0]["deg_s_per_lap"] == pytest.approx(0.02, abs=0.01)


def test_clean_laps_leave_out_pit_flag_traffic_and_lap_one():
    laps = race()
    laps.loc[laps["Lap"] == 30, "Green"] = False
    laps.loc[(laps["Driver"] == "BBB") & (laps["Lap"] == 10), "IntervalAhead"] = 0.8
    laps.loc[(laps["Driver"] == "CCC") & (laps["Lap"] == 12), "LapTime"] += 15  # a spin

    clean = clean_laps(laps)
    kept = set(zip(clean["Driver"], clean["Lap"]))

    assert not any(lap == 1 or lap == 30 for _, lap in kept)
    assert ("AAA", 15) not in kept and ("AAA", 16) not in kept  # in-lap, out-lap
    assert ("BBB", 10) not in kept and ("CCC", 12) not in kept
    assert ("AAA", 10) in kept


def test_a_slow_outlier_does_not_move_the_answer():
    laps = race(noise=0.05)
    laps.loc[(laps["Driver"] == "AAA") & (laps["Lap"] == 8), "LapTime"] += 4  # lift, within 7%

    result = fit_pace(laps)

    assert result["drivers"][0]["driver"] == "AAA"
    assert result["fuel"]["s_per_lap"] == pytest.approx(FUEL, abs=0.01)


def test_a_single_odd_tyre_age_does_not_buy_a_fuel_figure():
    """Near-collinear data must not claim a fuel effect it cannot pin down."""
    laps = race(stop_lap={}, noise=0.3)
    laps.loc[(laps["Driver"] == "AAA") & (laps["Lap"] == 20), "TyreAge"] += 3  # one glitched reading

    assert fit_pace(laps)["fuel"]["identified"] is False


def test_thin_data_says_so():
    result = fit_pace(race().head(3))

    assert result["status"] == "not_enough_laps" and result["reason"]


def test_live_laps_mark_stops_and_flags_inside_the_lap():
    laps = [
        {"driver_number": "1", "LapNumber": n, "LapTime": f"1:30.{n:03d}", "Utc": f"2026-11-22T06:{n:02d}:00Z",
         "Compound": "MEDIUM", "TyreAge": n, "Stint": 1, "IntervalAhead": "+2.0"}
        for n in range(1, 8)
    ]
    pits = [{"driver_number": "1", "kind": "in", "Utc": "2026-11-22T06:03:30Z"}]
    track = [(None, "1"), ("2026-11-22T06:05:20Z", "6"), ("2026-11-22T06:05:50Z", "1")]

    table = live_lap_table(laps, pits, track, {"1": "VER"}).set_index("Lap")

    assert table.loc[1, "PitLap"]  # the first lap seen has no known start
    assert table.loc[4, "PitLap"] and not table.loc[3, "PitLap"]
    assert not table.loc[6, "Green"] and table.loc[7, "Green"]  # a VSC inside lap 6 only
    assert table.loc[2, "Driver"] == "VER" and table.loc[2, "LapTime"] == pytest.approx(90.002)


def test_the_recorded_race_flags_real_stops():
    adapter = SignalRLiveAdapter()
    Replay(adapter, DEFAULT_REPLAY, speed=1.0).feed_all()
    table = live_lap_table(
        adapter.lap_history, adapter.pit_events, adapter.track_timeline, P.acronyms_from_state(adapter.state.get("DriverList"))
    )
    nor = table[table["Driver"] == "NOR"].set_index("Lap")

    # NOR stopped at the end of lap 49: in-lap 49, out-lap 50; the laps around are clean
    assert nor.loc[49, "PitLap"] and nor.loc[50, "PitLap"]
    assert not nor.loc[48, "PitLap"] and not nor.loc[51, "PitLap"]
    assert nor.loc[50, "LapTime"] > nor.loc[51, "LapTime"] + 15

    result = fit_pace(table)
    assert result["status"] == "ok" and result["laps_used"] > 200
    assert 0 < result["compounds"][0]["deg_s_per_lap"] < 0.2
