"""Roadmap #25, #26, #16: gap projection, catch ETA and the pit window from the pace model."""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from live.projection import chase, expected_lap, neighbours, pit_window  # noqa: E402


def model(**ages):
    """Medium wears 0.1 s/lap, hard 0.05 s/lap and is 0.5 s slower fresh; no fuel term."""
    pace = {"AAA": 90.0, "BBB": 90.0, "CCC": 90.0}
    tyres = {"AAA": ("MEDIUM", 20), "BBB": ("MEDIUM", 5), "CCC": ("HARD", 30)}
    tyres.update(ages)
    return {
        "status": "ok",
        "fuel": {"identified": False, "s_per_lap": None},
        "compounds": [
            {"compound": "MEDIUM", "deg_s_per_lap": 0.1, "offset_s": 0.0, "laps": 100},
            {"compound": "HARD", "deg_s_per_lap": 0.05, "offset_s": 0.5, "laps": 100},
        ],
        "drivers": [
            {"driver": d, "pace_s": p, "compound": tyres[d][0], "tyre_age": tyres[d][1]} for d, p in pace.items()
        ],
    }


def test_expected_lap_adds_offset_and_wear():
    assert expected_lap(model(), "CCC", "HARD", 10, 30) == pytest.approx(90.0 + 0.5 + 0.5)
    assert expected_lap(model(), "ZZZ", "HARD", 10, 30) is None


def test_fresher_tyres_close_the_gap_and_reach_mom_range():
    # BBB is 15 laps fresher on the same compound: 1.5 s a lap quicker, from 4.0 s behind
    result = chase(model(), "BBB", "AAA", 4.0, lap=30, laps_left=20)

    assert result["per_lap"] == pytest.approx(1.5)
    assert [p["gap"] for p in result["projected"][:2]] == pytest.approx([2.5, 1.0])
    assert result["mom_lap"] == 32  # 1.0 s: in range
    assert result["level_lap"] == 33


def test_a_car_already_in_range_says_so_and_a_slower_one_never_catches():
    assert chase(model(), "BBB", "AAA", 0.6, lap=30, laps_left=5)["mom_lap"] == 30
    slow = chase(model(), "AAA", "BBB", 2.0, lap=30, laps_left=10)
    assert slow["per_lap"] < 0 and slow["mom_lap"] is None and slow["level_lap"] is None


def test_unknown_gap_or_car_gives_no_projection():
    assert chase(model(), "BBB", "AAA", None, 30, 10)["per_lap"] is None
    assert chase(model(), "ZZZ", "AAA", 2.0, 30, 10)["per_lap"] is None


def test_neighbours_use_the_road_order():
    standings = pd.DataFrame(
        [
            {"Driver": "AAA", "Position": 1, "GapSeconds": 0.0, "Status": "ON TRACK"},
            {"Driver": "BBB", "Position": 2, "GapSeconds": 4.0, "Status": "ON TRACK"},
            {"Driver": "CCC", "Position": 3, "GapSeconds": 10.0, "Status": "ON TRACK"},
        ]
    )
    around = neighbours(model(), standings, "BBB", 30, 50)

    assert around["ahead"]["leader"] == "AAA" and around["ahead"]["gap"] == pytest.approx(4.0)
    assert around["behind"]["chaser"] == "CCC" and around["behind"]["gap"] == pytest.approx(6.0)


def test_old_tyres_and_many_laps_left_make_a_stop_pay():
    # AAA: 20-lap mediums, 30 laps to go; a fresh medium saves ~2 s a lap at first
    result = pit_window(model(), "AAA", lap=30, total_laps=60, net_loss=20.0)

    medium = next(o for o in result["options"] if o["compound"] == "MEDIUM")
    assert medium["gain_vs_stay"] > 0 and result["stay_out_wins"] is False
    assert 30 < medium["best_lap"] < 60


def test_fresh_tyres_and_few_laps_left_mean_stay_out():
    result = pit_window(model(), "BBB", lap=50, total_laps=60, net_loss=20.0)

    assert result["stay_out_wins"] is True


def test_the_pit_window_needs_the_lap_count():
    assert pit_window(model(), "AAA", 30, None, 20.0)["reason"]
