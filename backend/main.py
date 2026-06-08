"""
FastF1 → REST API wrapper
Serves F1 telemetry data in the same shape as OpenF1, so the Next.js frontend
can switch data sources with zero component changes.
"""

import os
import math
import logging
from typing import Optional
from datetime import datetime

import fastf1
import pandas as pd
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Config ──────────────────────────────────────────────────────────────────
CACHE_DIR = os.environ.get("FASTF1_CACHE", "./cache")
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("f1api")

# Enable FastF1 caching (massively speeds up repeat requests)
os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)

# ── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="F1 Telemetry API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ─────────────────────────────────────────────────────────────────
def _clean(val):
    """Replace NaN / NaT / unsupported types with None for JSON serialisation."""
    if val is None:
        return None
    # Handle pandas NaT
    if isinstance(val, type(pd.NaT)):
        return None
    if pd.isna(val):
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    if isinstance(val, pd.Timestamp):
        return val.isoformat()
    if isinstance(val, pd.Timedelta):
        return val.total_seconds()
    # numpy integer/float → python native
    try:
        import numpy as np
        if isinstance(val, (np.integer,)):
            return int(val)
        if isinstance(val, (np.floating,)):
            return float(val) if not np.isnan(val) else None
        if isinstance(val, (np.bool_,)):
            return bool(val)
    except ImportError:
        pass
    return val


def _rows(df: pd.DataFrame) -> list[dict]:
    """Convert a DataFrame to a list of dicts with NaN→None."""
    records = df.to_dict(orient="records")
    return [{k: _clean(v) for k, v in row.items()} for row in records]


def _load_session(year: int, gp, identifier: str, weather: bool = False):
    """Load a FastF1 session; returns None on failure."""
    try:
        session = fastf1.get_session(year, gp, identifier)
        session.load(
            laps=True,
            telemetry=False,  # only load when needed
            weather=weather,
            messages=False,
        )
        return session
    except Exception as e:
        log.warning(f"Failed to load session {year}/{gp}/{identifier}: {e}")
        return None


def _session_type_to_id(session_type: str) -> str:
    """Map OpenF1 session_type to FastF1 identifier."""
    mapping = {
        "Race": "R",
        "Qualifying": "Q",
        "Sprint": "S",
        "Sprint Qualifying": "SQ",
        "Sprint Shootout": "SS",
        "Practice 1": "FP1",
        "Practice 2": "FP2",
        "Practice 3": "FP3",
    }
    return mapping.get(session_type, session_type)


def _make_session_key(year: int, round_num: int, session_id: str) -> int:
    """Generate a deterministic session key from year + round + session type."""
    type_map = {"R": 1, "Q": 2, "S": 3, "SQ": 4, "SS": 5, "FP1": 6, "FP2": 7, "FP3": 8}
    type_num = type_map.get(session_id, 9)
    return year * 10000 + round_num * 10 + type_num


def _id_to_session_type(session_id: str) -> str:
    """Map FastF1 identifier back to OpenF1 session_type."""
    mapping = {
        "R": "Race", "Race": "Race",
        "Q": "Qualifying", "Qualifying": "Qualifying",
        "S": "Sprint", "Sprint": "Sprint",
        "SQ": "Sprint Qualifying", "Sprint Qualifying": "Sprint Qualifying",
        "SS": "Sprint Shootout", "Sprint Shootout": "Sprint Shootout",
        "FP1": "Practice 1", "Practice 1": "Practice 1",
        "FP2": "Practice 2", "Practice 2": "Practice 2",
        "FP3": "Practice 3", "Practice 3": "Practice 3",
    }
    return mapping.get(session_id, session_id)


# ── In-memory session cache ────────────────────────────────────────────────
_session_cache: dict[int, object] = {}


def _get_or_load(session_key: int, year: int, round_num: int, session_id: str):
    """Cache loaded sessions in-memory to avoid reloading from disk."""
    if session_key in _session_cache:
        return _session_cache[session_key]
    session = _load_session(year, round_num, session_id)
    if session is not None:
        _session_cache[session_key] = session
    return session


# ── Routes ──────────────────────────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "engine": "FastF1", "version": fastf1.__version__}


# ─────────────────────────────────────────────
# /meetings  — list race weekends for a year
# ─────────────────────────────────────────────
@app.get("/meetings")
def get_meetings(year: Optional[int] = None):
    target_year = year or datetime.now().year
    try:
        schedule = fastf1.get_event_schedule(target_year)
    except Exception as e:
        # If the requested year's schedule isn't published yet, fall back one year.
        if year is None:
            try:
                schedule = fastf1.get_event_schedule(target_year - 1)
                target_year = target_year - 1
            except Exception as e2:
                raise HTTPException(502, f"Failed to fetch schedule: {e2}")
        else:
            raise HTTPException(502, f"Failed to fetch schedule: {e}")

    meetings = []
    for _, event in schedule.iterrows():
        if event.get("EventFormat", "") == "testing":
            continue
        round_num = event.get("RoundNumber", 0)
        if round_num == 0:
            continue

        meeting_key = target_year * 100 + round_num
        meetings.append({
            "meeting_key": meeting_key,
            "meeting_name": event.get("EventName", ""),
            "meeting_official_name": event.get("OfficialEventName", ""),
            "date_start": str(event.get("EventDate", "")),
            "location": event.get("Location", ""),
            "country_name": event.get("Country", ""),
            "year": target_year,
            "circuit_short_name": event.get("Location", ""),
        })

    return JSONResponse(meetings)


# ─────────────────────────────────────────────
# /sessions  — list sessions for a meeting/year
# ─────────────────────────────────────────────
@app.get("/sessions")
def get_sessions(
    meeting_key: Optional[int] = None,
    session_type: Optional[str] = None,
    year: Optional[int] = None,
):
    target_year = year or (meeting_key // 100 if meeting_key else datetime.now().year)
    try:
        schedule = fastf1.get_event_schedule(target_year)
    except Exception as e:
        # Fall back one year if caller didn't pin a specific year/meeting and
        # the requested year's schedule isn't published yet.
        if year is None and not meeting_key:
            try:
                schedule = fastf1.get_event_schedule(target_year - 1)
                target_year = target_year - 1
            except Exception as e2:
                raise HTTPException(502, f"Failed to fetch schedule: {e2}")
        else:
            raise HTTPException(502, f"Failed to fetch schedule: {e}")

    sessions = []
    for _, event in schedule.iterrows():
        round_num = event.get("RoundNumber", 0)
        if round_num == 0:
            continue
        if event.get("EventFormat", "") == "testing":
            continue

        mk = target_year * 100 + round_num
        if meeting_key and mk != meeting_key:
            continue

        # FastF1 stores sessions as Session1..Session5 with SessionNDate
        for i in range(1, 6):
            session_name = event.get(f"Session{i}")
            session_date = event.get(f"Session{i}DateUtc")

            if not session_name or session_name == "None" or pd.isna(session_name):
                continue
            if pd.isna(session_date):
                continue

            # Map FastF1 session name to our standard type
            stype = _id_to_session_type(str(session_name))
            sid = _session_type_to_id(stype)

            if session_type and stype != session_type:
                continue

            sk = _make_session_key(target_year, round_num, sid)
            date_str = str(session_date) if session_date else ""

            sessions.append({
                "session_key": sk,
                "meeting_key": mk,
                "date_start": date_str,
                "date_end": date_str,
                "session_type": stype,
                "session_name": f"{event.get('EventName', '')} - {stype}",
                "location": event.get("Location", ""),
                "country_name": event.get("Country", ""),
                "circuit_short_name": event.get("Location", ""),
                "year": target_year,
                "_round": round_num,
                "_session_id": sid,
            })

    return JSONResponse(sessions)


# ─────────────────────────────────────────────
# /drivers  — drivers in a session
# ─────────────────────────────────────────────
@app.get("/drivers")
def get_drivers(session_key: int = Query(...)):
    year, round_num, session_id = _decode_session_key(session_key)
    session = _get_or_load(session_key, year, round_num, session_id)
    if session is None:
        return JSONResponse([])

    drivers = []
    try:
        results = session.results
        if results is None or results.empty:
            return JSONResponse([])

        for _, row in results.iterrows():
            drivers.append({
                "driver_number": int(row.get("DriverNumber", 0)),
                "broadcast_name": row.get("FullName", row.get("Abbreviation", "")),
                "name_acronym": row.get("Abbreviation", ""),
                "team_name": row.get("TeamName", ""),
                "team_colour": row.get("TeamColor", None),
                "headshot_url": row.get("HeadshotUrl", None),
                "full_name": row.get("FullName", ""),
            })
    except Exception as e:
        log.warning(f"Failed to extract drivers: {e}")

    return JSONResponse(drivers)


# ─────────────────────────────────────────────
# /laps  — lap-by-lap timing
# ─────────────────────────────────────────────
@app.get("/laps")
def get_laps(
    session_key: int = Query(...),
    driver_number: Optional[int] = None,
):
    year, round_num, session_id = _decode_session_key(session_key)
    session = _get_or_load(session_key, year, round_num, session_id)
    if session is None:
        return JSONResponse([])

    try:
        laps_df = session.laps
        if laps_df is None or laps_df.empty:
            return JSONResponse([])

        if driver_number:
            laps_df = laps_df[laps_df["DriverNumber"] == str(driver_number)]

        result = []
        for _, lap in laps_df.iterrows():
            lap_duration = lap.get("LapTime")
            if isinstance(lap_duration, pd.Timedelta):
                lap_duration = lap_duration.total_seconds()
            else:
                lap_duration = _clean(lap_duration)

            s1 = lap.get("Sector1Time")
            s2 = lap.get("Sector2Time")
            s3 = lap.get("Sector3Time")

            # Convert sector times safely
            duration_s1 = s1.total_seconds() if isinstance(s1, pd.Timedelta) else _clean(s1)
            duration_s2 = s2.total_seconds() if isinstance(s2, pd.Timedelta) else _clean(s2)
            duration_s3 = s3.total_seconds() if isinstance(s3, pd.Timedelta) else _clean(s3)

            result.append({
                "driver_number": int(lap.get("DriverNumber", 0)),
                "lap_number": int(lap.get("LapNumber", 0)),
                "lap_duration": lap_duration,
                "is_pit_out_lap": bool(lap.get("PitOutTime") is not None and not pd.isna(lap.get("PitOutTime"))),
                "st_speed": _clean(lap.get("SpeedST")),
                "i1_speed": _clean(lap.get("SpeedI1")),
                "i2_speed": _clean(lap.get("SpeedI2")),
                "duration_sector_1": duration_s1,
                "duration_sector_2": duration_s2,
                "duration_sector_3": duration_s3,
                "date_start": str(lap.get("LapStartDate", "")) if not pd.isna(lap.get("LapStartDate", pd.NaT)) else None,
            })

        return JSONResponse(result)
    except Exception as e:
        log.error(f"Failed to get laps: {e}")
        return JSONResponse([])


# ─────────────────────────────────────────────
# /stints  — tyre strategy
# ─────────────────────────────────────────────
@app.get("/stints")
def get_stints(
    session_key: int = Query(...),
    driver_number: Optional[int] = None,
):
    year, round_num, session_id = _decode_session_key(session_key)
    session = _get_or_load(session_key, year, round_num, session_id)
    if session is None:
        return JSONResponse([])

    try:
        laps_df = session.laps
        if laps_df is None or laps_df.empty:
            return JSONResponse([])

        if driver_number:
            laps_df = laps_df[laps_df["DriverNumber"] == str(driver_number)]

        stints = []
        for drv_num, group in laps_df.groupby("DriverNumber"):
            group = group.sort_values("LapNumber")
            stint_num = 0
            prev_compound = None
            stint_start = None

            for _, lap in group.iterrows():
                compound = lap.get("Compound", "UNKNOWN")
                stint_col = lap.get("Stint")

                if compound != prev_compound or stint_col != stint_num:
                    if prev_compound is not None:
                        stints[-1]["lap_end"] = int(lap.get("LapNumber", 0)) - 1

                    stint_num = int(stint_col) if not pd.isna(stint_col) else stint_num + 1
                    stint_start = int(lap.get("LapNumber", 0))
                    tyre_age = lap.get("TyreLife")

                    stints.append({
                        "driver_number": int(drv_num),
                        "stint_number": stint_num,
                        "compound": str(compound).upper() if compound else "UNKNOWN",
                        "lap_start": stint_start,
                        "lap_end": int(lap.get("LapNumber", 0)),
                        "tyre_age_at_start": int(tyre_age) if not pd.isna(tyre_age) else 0,
                    })
                    prev_compound = compound
                else:
                    if stints:
                        stints[-1]["lap_end"] = int(lap.get("LapNumber", 0))

        return JSONResponse(stints)
    except Exception as e:
        log.error(f"Failed to get stints: {e}")
        return JSONResponse([])


# ─────────────────────────────────────────────
# /session_result  — final session standings
# ─────────────────────────────────────────────
@app.get("/session_result")
def get_session_result(
    session_key: Optional[int] = None,
    driver_number: Optional[int] = None,
):
    """Per-session results. Either session_key (one session) or driver_number
    (scan this year's races for that driver) must be provided."""
    if session_key is None and driver_number is None:
        raise HTTPException(400, "session_key or driver_number is required")

    target_keys: list[int] = []
    if session_key is not None:
        target_keys = [session_key]
    else:
        # Scan all Race sessions in the current year for this driver.
        year = datetime.now().year
        try:
            schedule = fastf1.get_event_schedule(year)
        except Exception:
            schedule = fastf1.get_event_schedule(year - 1)
            year = year - 1
        for _, event in schedule.iterrows():
            if event.get("EventFormat", "") == "testing":
                continue
            round_num = event.get("RoundNumber", 0)
            if round_num == 0:
                continue
            target_keys.append(_make_session_key(year, round_num, "R"))

    out: list[dict] = []
    for sk in target_keys:
        y, r, sid = _decode_session_key(sk)
        session = _get_or_load(sk, y, r, sid)
        if session is None:
            continue
        try:
            results = session.results
            if results is None or results.empty:
                continue
            for _, row in results.iterrows():
                drv = int(row.get("DriverNumber", 0))
                if driver_number is not None and drv != driver_number:
                    continue
                pos = row.get("Position")
                gap = row.get("Time")
                if isinstance(gap, pd.Timedelta):
                    gap = gap.total_seconds()

                def _td(value):
                    if isinstance(value, pd.Timedelta):
                        return value.total_seconds()
                    return _clean(value)

                out.append({
                    "driver_number": drv,
                    "position": int(pos) if not pd.isna(pos) else None,
                    "number_of_laps": int(row.get("Laps")) if not pd.isna(row.get("Laps", float("nan"))) else None,
                    "gap_to_leader": _clean(gap),
                    "points": _clean(row.get("Points")),
                    "q1_time": _td(row.get("Q1")),
                    "q2_time": _td(row.get("Q2")),
                    "q3_time": _td(row.get("Q3")),
                    "session_key": sk,
                    "meeting_key": y * 100 + r,
                })
        except Exception as e:
            log.warning(f"Failed to extract session_result for {sk}: {e}")
            continue

    return JSONResponse(out)


# ─────────────────────────────────────────────
# /car_data  — high-frequency telemetry
# ─────────────────────────────────────────────
@app.get("/car_data")
def get_car_data(
    session_key: int = Query(...),
    driver_number: int = Query(...),
    lap_number: Optional[int] = None,
):
    year, round_num, session_id = _decode_session_key(session_key)

    try:
        # Need to reload with telemetry enabled
        session = fastf1.get_session(year, round_num, session_id)
        session.load(laps=True, telemetry=True, weather=False, messages=False)
    except Exception as e:
        log.error(f"Failed to load telemetry: {e}")
        return JSONResponse([])

    try:
        laps = session.laps
        drv_laps = laps[laps["DriverNumber"] == str(driver_number)]

        if lap_number:
            drv_laps = drv_laps[drv_laps["LapNumber"] == lap_number]

        if drv_laps.empty:
            return JSONResponse([])

        telemetry = drv_laps.get_telemetry()
        if telemetry is None or telemetry.empty:
            return JSONResponse([])

        # Downsample if too large (>5000 points)
        if len(telemetry) > 5000:
            step = len(telemetry) // 5000
            telemetry = telemetry.iloc[::step]

        mk = year * 100 + round_num
        result = []
        for _, t in telemetry.iterrows():
            date_val = t.get("Date") or t.get("Time")
            result.append({
                "date": str(date_val) if date_val is not None else "",
                "session_key": session_key,
                "meeting_key": mk,
                "driver_number": driver_number,
                "speed": _clean(t.get("Speed", 0)),
                "throttle": _clean(t.get("Throttle", 0)),
                "brake": _clean(t.get("Brake", 0)),
                "n_gear": int(t.get("nGear", 0)) if not pd.isna(t.get("nGear", 0)) else 0,
                "rpm": _clean(t.get("RPM", 0)),
                "drs": _clean(t.get("DRS")),
            })

        return JSONResponse(result)
    except Exception as e:
        log.error(f"Failed to get car data: {e}")
        return JSONResponse([])


# ─────────────────────────────────────────────
# /lap_telemetry  — single-lap telemetry with track position
# Powers quali track-dominance map, delta-vs-distance, mini-sectors.
# ─────────────────────────────────────────────
@app.get("/lap_telemetry")
def get_lap_telemetry(
    session_key: int = Query(...),
    driver_number: int = Query(...),
    lap_number: Optional[int] = None,
):
    """Return distance-aligned telemetry (X/Y position, speed, time) for a
    driver's fastest lap (or a specific lap if lap_number is given)."""
    year, round_num, session_id = _decode_session_key(session_key)

    try:
        session = fastf1.get_session(year, round_num, session_id)
        session.load(laps=True, telemetry=True, weather=False, messages=False)
    except Exception as e:
        log.error(f"Failed to load telemetry: {e}")
        return JSONResponse({"points": []})

    try:
        laps = session.laps
        drv_laps = laps[laps["DriverNumber"] == str(driver_number)]

        if lap_number:
            drv_laps = drv_laps[drv_laps["LapNumber"] == lap_number]

        if drv_laps is None or drv_laps.empty:
            return JSONResponse({"points": []})

        lap = drv_laps.iloc[0] if lap_number else drv_laps.pick_fastest()
        if lap is None or (hasattr(lap, "empty") and lap.empty):
            return JSONResponse({"points": []})

        tel = lap.get_telemetry()
        if tel is None or tel.empty or "Distance" not in tel.columns or "X" not in tel.columns:
            return JSONResponse({"points": []})

        # Normalise time so the lap starts at t=0
        t0 = tel["Time"].iloc[0] if "Time" in tel.columns else None

        # Downsample large traces
        if len(tel) > 1500:
            step = len(tel) // 1500
            tel = tel.iloc[::step]

        points = []
        for _, p in tel.iterrows():
            t = p.get("Time")
            if isinstance(t, pd.Timedelta) and isinstance(t0, pd.Timedelta):
                time_s = (t - t0).total_seconds()
            else:
                time_s = _clean(t)
            points.append({
                "distance": _clean(p.get("Distance")),
                "time": time_s,
                "speed": _clean(p.get("Speed")),
                "x": _clean(p.get("X")),
                "y": _clean(p.get("Y")),
            })

        lap_time = lap.get("LapTime")
        return JSONResponse({
            "driver_number": driver_number,
            "lap_number": int(lap.get("LapNumber")) if not pd.isna(lap.get("LapNumber", float("nan"))) else None,
            "lap_time": lap_time.total_seconds() if isinstance(lap_time, pd.Timedelta) else None,
            "points": points,
        })
    except Exception as e:
        log.error(f"Failed to get lap telemetry: {e}")
        return JSONResponse({"points": []})


# ─────────────────────────────────────────────
# /intervals  — gap to leader (from position data)
# ─────────────────────────────────────────────
@app.get("/intervals")
def get_intervals(session_key: int = Query(...)):
    # FastF1 doesn't have a direct "intervals" equivalent,
    # but we can derive it from lap data
    year, round_num, session_id = _decode_session_key(session_key)
    session = _get_or_load(session_key, year, round_num, session_id)
    if session is None:
        return JSONResponse([])

    try:
        laps = session.laps
        if laps is None or laps.empty:
            return JSONResponse([])

        # Get the last lap for each driver as "current" interval
        last_laps = laps.groupby("DriverNumber").last().reset_index()
        leader_time = last_laps["LapTime"].min()

        intervals = []
        for _, row in last_laps.iterrows():
            lap_time = row.get("LapTime")
            gap = None
            if isinstance(lap_time, pd.Timedelta) and isinstance(leader_time, pd.Timedelta):
                gap = (lap_time - leader_time).total_seconds()

            intervals.append({
                "driver_number": int(row.get("DriverNumber", 0)),
                "gap_to_leader": _clean(gap),
                "interval": _clean(gap),
                "date": str(row.get("LapStartDate", "")),
                "session_key": session_key,
                "meeting_key": year * 100 + round_num,
            })

        return JSONResponse(intervals)
    except Exception as e:
        log.error(f"Failed to get intervals: {e}")
        return JSONResponse([])


# ─────────────────────────────────────────────
# /weather  — track conditions over the session
# ─────────────────────────────────────────────
@app.get("/weather")
def get_weather(session_key: int = Query(...)):
    year, round_num, session_id = _decode_session_key(session_key)
    try:
        session = fastf1.get_session(year, round_num, session_id)
        session.load(laps=False, telemetry=False, weather=True, messages=False)
    except Exception as e:
        log.warning(f"Failed to load weather: {e}")
        return JSONResponse([])

    try:
        wdf = session.weather_data
        if wdf is None or wdf.empty:
            return JSONResponse([])

        rows = []
        for _, w in wdf.iterrows():
            t = w.get("Time")
            rows.append({
                "time_seconds": t.total_seconds() if isinstance(t, pd.Timedelta) else _clean(t),
                "air_temp": _clean(w.get("AirTemp")),
                "track_temp": _clean(w.get("TrackTemp")),
                "humidity": _clean(w.get("Humidity")),
                "pressure": _clean(w.get("Pressure")),
                "wind_speed": _clean(w.get("WindSpeed")),
                "wind_direction": _clean(w.get("WindDirection")),
                "rainfall": bool(w.get("Rainfall")) if not pd.isna(w.get("Rainfall", False)) else False,
            })
        return JSONResponse(rows)
    except Exception as e:
        log.error(f"Failed to get weather: {e}")
        return JSONResponse([])


# ─────────────────────────────────────────────
# /position  — driver position over time
# ─────────────────────────────────────────────
@app.get("/position")
def get_position(session_key: int = Query(...)):
    year, round_num, session_id = _decode_session_key(session_key)
    session = _get_or_load(session_key, year, round_num, session_id)
    if session is None:
        return JSONResponse([])

    try:
        laps = session.laps
        if laps is None or laps.empty:
            return JSONResponse([])

        positions = []
        for _, lap in laps.iterrows():
            pos = lap.get("Position")
            positions.append({
                "driver_number": int(lap.get("DriverNumber", 0)),
                "position": int(pos) if not pd.isna(pos) else None,
                "lap_number": int(lap.get("LapNumber", 0)),
                "session_key": session_key,
                "date": str(lap.get("LapStartDate", "")),
            })

        return JSONResponse(positions)
    except Exception as e:
        log.error(f"Failed to get positions: {e}")
        return JSONResponse([])


# ── Session Key codec ───────────────────────────────────────────────────────
def _decode_session_key(session_key: int) -> tuple[int, int, str]:
    """Decode our deterministic session_key → (year, round, session_id)."""
    type_num = session_key % 10
    remainder = session_key // 10
    round_num = remainder % 1000
    year = remainder // 1000

    type_map = {1: "R", 2: "Q", 3: "S", 4: "SQ", 5: "SS", 6: "FP1", 7: "FP2", 8: "FP3"}
    session_id = type_map.get(type_num, "R")

    return year, round_num, session_id


# ── Entrypoint ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
