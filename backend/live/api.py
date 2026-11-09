"""``/live/*`` endpoints for the Next.js live page. Polled by the browser; F1 is contacted only by the service."""

from __future__ import annotations

import os
from dataclasses import asdict
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from . import snapshot
from .adapter import LiveDataProcessor as P
from .circuit_pit_loss import historical_net_loss
from .pace import TRAFFIC_S, fit_pace, live_lap_table
from .pit_loss import DEFAULT_NET_PIT_LOSS, NET_PIT_LOSS_NOTE
from .pit_strategy import (
    driver_summary,
    loss_range,
    loss_scenarios,
    net_loss_check,
    observed_pit_lane_median,
    stale_warning,
)
from .service import (
    BACKEND_DIR,
    DEFAULT_REPLAY,
    STREAM_FILE,
    live_enabled,
    recordings_dir,
    service,
)

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
DEFAULT_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"


def allowed_origins() -> set[str]:
    raw = os.environ.get("F1_LIVE_ALLOWED_ORIGINS", DEFAULT_ORIGINS)
    return {origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()}


def local_only(request: Request) -> None:
    """Only this machine's own frontend may use /live.

    The app answers CORS with ``*``, so without this any page open in the
    browser could start the feed with your F1TV token or read it. The Host must
    be a loopback name (blocks DNS rebinding), and a browser's Origin must be
    the frontend's (``F1_LIVE_ALLOWED_ORIGINS``). Requests with no Origin
    (curl, scripts on this machine) pass.
    """
    host = (request.url.hostname or "").lower()
    if host not in LOCAL_HOSTS:
        raise HTTPException(status_code=403, detail="Live timing only answers on localhost")
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") not in allowed_origins():
        raise HTTPException(
            status_code=403,
            detail="This origin may not use live timing (set F1_LIVE_ALLOWED_ORIGINS)",
        )


router = APIRouter(prefix="/live", tags=["live"], dependencies=[Depends(local_only)])


def _require_enabled() -> None:
    if not live_enabled():
        raise HTTPException(
            status_code=403,
            detail="Live timing is off on this server. Set F1_LIVE_ENABLED=1 in backend/.env "
            "on a backend running on your own machine.",
        )


class StartRequest(BaseModel):
    mode: str = "live"  # "live" or "replay"
    speed: float = 1.0
    skip_s: float = 0.0
    # a recording from /live/recordings (default: the 2026 Sao Paulo race)
    file: str | None = None


class SpeedRequest(BaseModel):
    speed: float


class SeekRequest(BaseModel):
    lap: int


def _recording_path(name: str) -> Path:
    """A recording named by /live/recordings, kept inside backend/ or the recordings folder."""
    roots = [recordings_dir().resolve(), BACKEND_DIR.resolve()]
    for root in roots:
        path = (root / name).resolve()
        if any(r == path or r in path.parents for r in roots) and path.exists():
            return path
    raise HTTPException(status_code=400, detail="Unknown recording; pick one from /live/recordings")


@router.get("/status")
def status() -> dict:
    return {"enabled": live_enabled(), **service.status(), "token": snapshot.token_info()}


@router.post("/start")
def start(request: StartRequest) -> dict:
    _require_enabled()
    if request.mode == "live":
        service.start_live()
    elif request.mode == "replay":
        path = _recording_path(request.file) if request.file else DEFAULT_REPLAY
        try:
            service.start_replay(path, request.speed, request.skip_s)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    else:
        raise HTTPException(status_code=400, detail="mode is 'live' or 'replay'")
    return status()


def _replay():
    _require_enabled()
    if service.mode != "replay" or service.replay is None:
        raise HTTPException(status_code=409, detail="No replay is running")
    return service.replay


@router.post("/replay/pause")
def replay_pause() -> dict:
    _replay().pause()
    return status()


@router.post("/replay/resume")
def replay_resume() -> dict:
    _replay().resume()
    return status()


@router.post("/replay/speed")
def replay_speed(request: SpeedRequest) -> dict:
    if not 0.1 <= request.speed <= 120:
        raise HTTPException(status_code=400, detail="speed is between 0.1 and 120")
    _replay().set_speed(request.speed)
    return status()


@router.post("/replay/seek")
def replay_seek(request: SeekRequest) -> dict:
    try:
        _replay().seek_lap(request.lap)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return status()


@router.post("/stop")
def stop() -> dict:
    _require_enabled()
    service.stop()
    return status()


@router.get("/snapshot")
def get_snapshot() -> dict:
    _require_enabled()
    return snapshot.build(service.adapter, service.now())


@router.get("/telemetry")
def get_telemetry(drivers: str = "", seconds: float = Query(60.0, ge=5, le=600)) -> dict:
    _require_enabled()
    codes = [code.strip().upper() for code in drivers.split(",") if code.strip()]
    return snapshot.telemetry(service.adapter, codes, seconds)


@router.get("/gaps")
def get_gaps(drivers: str = "", minutes: float = Query(30.0, ge=1, le=360)) -> dict:
    """Gap to the leader over time for ``drivers`` (comma-separated codes; all when empty)."""
    _require_enabled()
    codes = [code.strip().upper() for code in drivers.split(",") if code.strip()]
    return snapshot.clean(service.history.series(codes, minutes))


@router.get("/positions")
def get_positions() -> dict:
    _require_enabled()
    return snapshot.positions(service.adapter)


@router.get("/strategy")
def get_strategy(driver: str, net_loss: float = Query(DEFAULT_NET_PIT_LOSS, ge=0, le=90)) -> dict:
    """Where ``driver`` rejoins after a stop with ``net_loss`` seconds of net loss, from now."""
    _require_enabled()
    adapter = service.adapter
    state = snapshot.build(adapter, service.now())
    standings = pd.DataFrame(state["standings"])
    stints = pd.DataFrame(state["stints"])
    drivers = pd.DataFrame(state["drivers"])
    session = state["session"]
    quicker, prediction, slower = loss_scenarios(
        standings,
        driver,
        net_loss,
        flag=session["flag"],
        race=session["is_race"],
        data_age_s=session["data_age_s"],
    )
    lane_median, lane_stops = observed_pit_lane_median(pd.DataFrame(state["pit_lane_times"]))
    summary = driver_summary(standings, driver, stints, drivers)
    check = net_loss_check(net_loss, lane_median)
    return snapshot.clean(
        {
            "driver": driver,
            "summary": asdict(summary) if summary else None,
            "prediction": {**asdict(prediction), "places_lost": prediction.places_lost},
            "scenarios": [
                {"net_pit_loss": s.net_pit_loss, "position": s.position, "position_range": s.position_range, "status": s.status}
                for s in (quicker, prediction, slower)
            ],
            "net_loss": {
                "value": net_loss,
                "default": DEFAULT_NET_PIT_LOSS,
                "range": loss_range(DEFAULT_NET_PIT_LOSS),
                "note": NET_PIT_LOSS_NOTE,
                "check": check,
            },
            "observed_pit_lane": {"median": lane_median, "stops": lane_stops},
            "stale": stale_warning(session["data_age_s"]),
            "session": session,
        }
    )


@router.get("/pace")
def get_pace(traffic_s: float = Query(TRAFFIC_S, ge=0, le=5)) -> dict:
    """Clean-lap race pace: degradation per compound, fuel effect, underlying pace per driver."""
    _require_enabled()
    adapter = service.adapter
    with adapter._buffer_lock:
        laps, pits, track = list(adapter.lap_history), list(adapter.pit_events), list(adapter.track_timeline)
    acronyms = P.acronyms_from_state(adapter.state.get("DriverList"))
    table = live_lap_table(laps, pits, track, acronyms)
    return snapshot.clean(fit_pace(table, traffic_s))


@router.get("/pit-loss/history")
def get_pit_loss_history(event: str = "", year: int | None = Query(None, ge=2018, le=2100)) -> dict:
    """Net pit loss measured at this circuit in the three seasons before ``year``.

    Defaults to the live session's event and season. The first call per circuit
    loads three races from the archive (tens of seconds); after that it is cached.
    """
    _require_enabled()
    session = snapshot.session_info(service.adapter, service.now())
    event = event or session.get("gp") or ""
    year = year or session.get("year")
    if not event or event == "Live session" or not year:
        raise HTTPException(409, "No session loaded: start live or a replay first.")
    return snapshot.clean(historical_net_loss(event, int(year)))


def recordings() -> list[dict]:
    """Recordings a replay can start from: Go-live session folders (newest first), then the fixtures."""
    found: list[dict] = []
    root = recordings_dir()
    if root.is_dir():
        for folder in root.iterdir():
            stream = next((folder / n for n in (STREAM_FILE, STREAM_FILE + ".gz") if (folder / n).is_file()), None)
            if stream is None:
                continue
            found.append(
                {
                    "name": folder.name,  # looked up inside the recordings folder
                    "label": folder.name,
                    "size_mb": round(stream.stat().st_size / 1e6, 1),
                    "modified": stream.stat().st_mtime,
                }
            )
    found.sort(key=lambda r: r["modified"], reverse=True)
    fixtures = sorted((BACKEND_DIR / "tests" / "fixtures").glob("*.jsonl*"))
    found.extend(
        {
            "name": str(p.relative_to(BACKEND_DIR)),
            "label": p.name.split(".")[0],
            "size_mb": round(p.stat().st_size / 1e6, 1),
            "modified": p.stat().st_mtime,
        }
        for p in fixtures
    )
    return found


@router.get("/recordings")
def list_recordings() -> dict:
    _require_enabled()
    return {"recordings": recordings(), "default": str(Path(DEFAULT_REPLAY).relative_to(BACKEND_DIR))}
