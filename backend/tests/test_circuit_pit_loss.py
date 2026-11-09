"""Roadmap #14: net pit loss measured from a circuit's past races (in-lap + out-lap)."""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from live import circuit_pit_loss as cpl  # noqa: E402

NAT = None


def _laps(driver, times, pit_in=(), status=None):
    """A race for one driver: lap ``n`` in-lap when ``n`` in pit_in (lap n+1 is the out-lap)."""
    rows = []
    for n, t in enumerate(times, start=1):
        rows.append(
            {
                "Driver": driver,
                "LapNumber": float(n),
                "LapTime": pd.to_timedelta(t, unit="s") if t is not None else NAT,
                "PitInTime": pd.to_timedelta(n * 100, unit="s") if n in pit_in else NAT,
                "PitOutTime": pd.to_timedelta(n * 100, unit="s") if n - 1 in pit_in else NAT,
                "TrackStatus": (status or {}).get(n, "1"),
            }
        )
    return pd.DataFrame(rows)


def test_loss_is_in_lap_plus_out_lap_minus_two_normal_laps():
    # normal lap 95 s; in-lap 100 s and out-lap 112 s cost 5 + 17 = 22 s
    times = [110] + [95] * 8 + [100, 112] + [95] * 8
    rows = cpl.stop_losses(_laps("VER", times, pit_in={10}))

    assert rows == [{"driver": "VER", "lap": 10, "loss": 22.0}]


def test_stops_under_safety_car_or_vsc_are_left_out():
    times = [110] + [95] * 8 + [100, 112] + [95] * 8
    sc = _laps("VER", times, pit_in={10}, status={10: "4"})
    vsc = _laps("VER", times, pit_in={10}, status={11: "16"})

    assert cpl.stop_losses(sc) == [] and cpl.stop_losses(vsc) == []


def test_reference_pace_ignores_slow_laps_under_yellow():
    times = [110] + [95] * 8 + [100, 112] + [95] * 8
    times[5] = 140  # lap 6, under SC: not a normal lap
    rows = cpl.stop_losses(_laps("VER", times, pit_in={10}, status={6: "4"}))

    assert rows[0]["loss"] == 22.0


def test_drive_throughs_and_missing_laps_are_not_stops():
    long_stop = [110] + [95] * 8 + [100, 160] + [95] * 8  # a 70 s "stop": a repair
    no_time = [110] + [95] * 8 + [100, None] + [95] * 8
    assert cpl.stop_losses(_laps("VER", long_stop, pit_in={10})) == []
    assert cpl.stop_losses(_laps("VER", no_time, pit_in={10})) == []


def test_history_summarises_and_caches(tmp_path, monkeypatch):
    monkeypatch.setattr(cpl, "CACHE_FILE", tmp_path / "cache.json")
    times = [110] + [95] * 8 + [100, 112] + [95] * 8
    calls = []

    def loader(year, event):
        calls.append(year)
        return pd.concat([_laps("VER", times, pit_in={10}), _laps("NOR", [t + 0.5 for t in times], pit_in={10})])

    first = cpl.historical_net_loss("Las Vegas Grand Prix", 2026, loader=loader)
    second = cpl.historical_net_loss("Las Vegas Grand Prix", 2026, loader=loader)

    assert first["years"] == [2023, 2024, 2025]
    assert first["overall"] == {"median": 22.0, "p25": 22.0, "p75": 22.0, "stops": 6}
    assert second == first and calls == [2023, 2024, 2025]  # the second answer came from disk


def test_a_missing_season_is_not_cached(tmp_path, monkeypatch):
    monkeypatch.setattr(cpl, "CACHE_FILE", tmp_path / "cache.json")
    times = [110] + [95] * 8 + [100, 112] + [95] * 8

    result = cpl.historical_net_loss(
        "Las Vegas Grand Prix", 2026, loader=lambda y, e: None if y == 2023 else _laps("VER", times, pit_in={10})
    )

    assert result["years"] == [2024, 2025]
    assert not (tmp_path / "cache.json").exists()  # retried next time, in case the archive refused


def test_a_season_without_green_flag_stops_is_still_cached(tmp_path, monkeypatch):
    """São Paulo 2024 ran wet with a red flag: it loads, but no stop is measurable."""
    monkeypatch.setattr(cpl, "CACHE_FILE", tmp_path / "cache.json")
    times = [110] + [95] * 8 + [100, 112] + [95] * 8

    def loader(year, event):
        return _laps("VER", times, pit_in={10}, status={10: "4"} if year == 2024 else None)

    result = cpl.historical_net_loss("São Paulo Grand Prix", 2026, loader=loader)

    assert result["years"] == [2023, 2025]
    assert (tmp_path / "cache.json").exists()
