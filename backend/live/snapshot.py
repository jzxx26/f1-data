"""The adapter's merged state -> JSON for the Next.js live page.

Everything here reads :class:`live.adapter.SignalRLiveAdapter` and returns
plain dicts/lists (no NaN, no Timestamps), so FastAPI can serialise it as is.
Parsing is the adapter's ``LiveDataProcessor``; this module only shapes it.
"""

from __future__ import annotations

import math
from typing import Any

import pandas as pd

from .adapter import LiveDataProcessor as P
from .adapter import SignalRLiveAdapter, subscription_token
from .formatting import is_race_session
from .live_state import as_list
from .signalr_core import token_expiry
from .time_utils import to_seconds

# Official TrackStatus codes -> flag states.
TRACK_STATUS_FLAGS = {
    "1": "GREEN",
    "2": "YELLOW",
    "4": "SAFETY CAR",
    "5": "RED",
    "6": "VSC",
    "7": "VSC",
}
TELEMETRY_CHANNELS = ("Speed", "Throttle", "Brake", "RPM", "nGear", "DRS")


def clean(value: Any) -> Any:
    """JSON-safe: NaN/NaT -> None, Timestamps -> ISO strings, numpy -> Python."""
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.isoformat()
    if value is None or value is pd.NaT:
        return None
    if hasattr(value, "item") and not isinstance(value, (str, bytes)):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def records(frame: pd.DataFrame | None) -> list[dict]:
    if frame is None or frame.empty:
        return []
    return clean(frame.to_dict("records"))


def extrapolated_remaining(clock: dict, now: pd.Timestamp) -> str | None:
    """Time left on the session clock, ``H:MM:SS`` (running clocks count down from ``Utc``)."""
    remaining = to_seconds(clock.get("Remaining")) if clock else None
    if remaining is None:
        return None
    if clock.get("Extrapolating") in (True, "true", "True"):
        stamp = pd.to_datetime(clock.get("Utc"), utc=True, errors="coerce")
        if pd.notna(stamp):
            remaining -= max((now - stamp).total_seconds(), 0.0)
    total = max(round(remaining), 0)
    return f"{total // 3600}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def session_info(adapter: SignalRLiveAdapter, now: pd.Timestamp) -> dict:
    """Meeting, session, lap count, clock, flag and heartbeat."""
    si = adapter.state.get("SessionInfo") or {}
    meeting = si.get("Meeting") if isinstance(si.get("Meeting"), dict) else {}
    lap_count = adapter.state.get("LapCount") or {}
    track = P.parse_track_status([adapter.state.get("TrackStatus") or {}]) or {}
    heartbeat = pd.to_datetime(adapter.last_heartbeat, utc=True, errors="coerce")
    age = None if pd.isna(heartbeat) else max((now - heartbeat).total_seconds(), 0.0)
    return {
        "gp": meeting.get("Name") or "Live session",
        "country": (meeting.get("Country") or {}).get("Name"),
        "circuit": (meeting.get("Circuit") or {}).get("ShortName"),
        "session_name": si.get("Name") or "",
        "session_type": si.get("Type") or "",
        "status": (adapter.state.get("SessionStatus") or {}).get("Status", ""),
        "current_lap": lap_count.get("CurrentLap"),
        "total_laps": lap_count.get("TotalLaps"),
        "clock_remaining": extrapolated_remaining(adapter.state.get("ExtrapolatedClock") or {}, now),
        "track_status": track.get("status"),
        "track_message": track.get("message"),
        "flag": TRACK_STATUS_FLAGS.get(str(track.get("status")), "GREEN"),
        "last_heartbeat": adapter.last_heartbeat,
        "data_age_s": None if age is None else round(age, 1),
    }


def stints_frame(adapter: SignalRLiveAdapter, acronyms: dict[str, str]) -> pd.DataFrame:
    stint_state = adapter.state.get("TyreStintSeries") or P.stints_from_timing_app(
        adapter.state.get("TimingAppData")
    )
    return P.stints_from_state(stint_state, acronyms)


def build(adapter: SignalRLiveAdapter, now: pd.Timestamp) -> dict:
    """The live page's main payload: session, tower, tyres, pit times, messages, weather."""
    driver_state = adapter.state.get("DriverList")
    drivers = P.drivers_from_state(driver_state)
    acronyms = P.acronyms_from_state(driver_state)
    info = session_info(adapter, now)
    race = is_race_session(info)
    timing = adapter.state.get("TimingData")
    standings = (
        P.standings_from_state(timing, acronyms, race=race) if timing else pd.DataFrame()
    )
    stints = stints_frame(adapter, acronyms)
    current_tyre: dict[str, dict] = {}
    if not stints.empty:
        for row in stints.sort_values("Stint").to_dict("records"):
            current_tyre[str(row["Driver"])] = {
                "compound": row.get("Compound"),
                "age": row.get("TyreAge"),
                "new": row.get("New"),
                "stint": row.get("Stint"),
            }
    rcm = adapter.state.get("RaceControlMessages") or {}
    messages = P.parse_race_control([m for m in as_list(rcm.get("Messages")) if isinstance(m, dict)])
    weather = P.parse_weather_data(adapter.get_buffered_data("WeatherData"))
    pit_times = P.pit_lane_times(adapter.recorded_pit_times(), acronyms)
    return clean(
        {
            "session": {**info, "is_race": race},
            "drivers": records(drivers),
            "standings": records(standings),
            "tyres": current_tyre,
            "stints": records(stints),
            "pit_lane_times": records(pit_times),
            "race_control": records(messages.tail(30)) if not messages.empty else [],
            "weather": records(weather.tail(1))[0] if not weather.empty else None,
        }
    )


def telemetry(adapter: SignalRLiveAdapter, drivers: list[str], seconds: float) -> dict:
    """The last ``seconds`` of car data for each driver code in ``drivers``."""
    acronyms = P.acronyms_from_state(adapter.state.get("DriverList"))
    car = P.parse_car_data(adapter.get_buffered_data("CarData.z"))
    out: dict[str, list[dict]] = {}
    if car.empty:
        return {"drivers": out, "has_data": False}
    car["timestamp"] = P.parsed_timestamps(car["timestamp"])
    car = car.dropna(subset=["timestamp"])
    if car.empty:
        return {"drivers": out, "has_data": False}
    end = car["timestamp"].max()
    car = car[car["timestamp"] >= end - pd.to_timedelta(seconds, unit="s")]
    wanted = set(drivers)
    for number, group in car.groupby("driver_number"):
        code = acronyms.get(str(number), f"#{number}")
        if wanted and code not in wanted:
            continue
        group = group.sort_values("timestamp")
        relative = (group["timestamp"] - end).dt.total_seconds().round(2)
        frame = group[[c for c in TELEMETRY_CHANNELS if c in group.columns]].assign(t=relative)
        out[code] = records(frame)
    return {"drivers": out, "has_data": True, "end": clean(end)}


def positions(adapter: SignalRLiveAdapter, trail_seconds: float = 150.0) -> dict:
    """Each car's latest X/Y, plus one car's recent path as the track outline."""
    acronyms = P.acronyms_from_state(adapter.state.get("DriverList"))
    pos = P.parse_position_data(adapter.get_buffered_data("Position.z"))
    if pos.empty:
        return {"cars": [], "outline": [], "has_data": False}
    pos["timestamp"] = P.parsed_timestamps(pos["timestamp"])
    pos = pos.dropna(subset=["timestamp", "X", "Y"]).sort_values("timestamp")
    latest = pos.groupby("driver_number").tail(1)
    cars = [
        {"driver": acronyms.get(str(r["driver_number"]), f"#{r['driver_number']}"), "x": r["X"], "y": r["Y"]}
        for r in latest.to_dict("records")
    ]
    end = pos["timestamp"].max()
    recent = pos[pos["timestamp"] >= end - pd.to_timedelta(trail_seconds, unit="s")]
    outline: list[list[float]] = []
    if not recent.empty:
        busiest = recent["driver_number"].value_counts().idxmax()
        path = recent[recent["driver_number"] == busiest]
        outline = [[float(x), float(y)] for x, y in zip(path["X"], path["Y"], strict=True)]
    return clean({"cars": cars, "outline": outline, "has_data": True})


def token_info() -> dict:
    """Whether a subscription token is set and when it expires (never the token itself)."""
    token = subscription_token()
    expiry = token_expiry(token) if token else None
    expired = bool(expiry and expiry <= pd.Timestamp.now(tz="UTC"))
    return {"set": bool(token), "expires": expiry.isoformat() if expiry else None, "expired": expired}
