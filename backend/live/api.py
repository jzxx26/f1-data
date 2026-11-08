"""``/live/*`` endpoints for the Next.js live page. Polled by the browser; F1 is contacted only by the service."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from . import snapshot
from .pit_loss import DEFAULT_NET_PIT_LOSS, NET_PIT_LOSS_NOTE
from .pit_strategy import (
    driver_summary,
    loss_range,
    loss_scenarios,
    net_loss_check,
    observed_pit_lane_median,
    stale_warning,
)
from .service import BACKEND_DIR, DEFAULT_REPLAY, live_enabled, service

router = APIRouter(prefix="/live", tags=["live"])


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
    file: str | None = None  # a recording under backend/ (default: the 2026 Sao Paulo race)


@router.get("/status")
def status() -> dict:
    return {"enabled": live_enabled(), **service.status(), "token": snapshot.token_info()}


@router.post("/start")
def start(request: StartRequest) -> dict:
    _require_enabled()
    if request.mode == "live":
        service.start_live()
    elif request.mode == "replay":
        path = DEFAULT_REPLAY
        if request.file:
            path = (BACKEND_DIR / request.file).resolve()
            if BACKEND_DIR not in path.parents:
                raise HTTPException(status_code=400, detail="The recording must be inside backend/")
        try:
            service.start_replay(path, request.speed, request.skip_s)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    else:
        raise HTTPException(status_code=400, detail="mode is 'live' or 'replay'")
    return status()


@router.post("/stop")
def stop() -> dict:
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


def recordings() -> list[str]:
    """Recordings under backend/ a replay can start from."""
    return sorted(
        str(p.relative_to(BACKEND_DIR))
        for pattern in ("*.jsonl", "*.jsonl.gz")
        for p in BACKEND_DIR.rglob(pattern)
        if ".venv" not in p.parts
    )


@router.get("/recordings")
def list_recordings() -> dict:
    _require_enabled()
    return {"recordings": recordings(), "default": str(Path(DEFAULT_REPLAY).relative_to(BACKEND_DIR))}
