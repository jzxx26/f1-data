"""One live feed per backend process, from F1's SignalR Core hub or a recording.

``live``: the SignalR Core client (``live.signalr_core``), with the F1TV
subscription token from ``F1TV_SUBSCRIPTION_TOKEN`` sent as a Bearer header so
``CarData.z`` and ``Position.z`` arrive. The token is read from the
environment or ``backend/.env`` and is never logged or returned.

``replay``: a recorded stream (``*.jsonl`` or ``*.jsonl.gz``, as written by the
recorder) fed through the same two entry points the live client uses
(``seed_state`` and ``handle_message``), paced by its own timestamps. The
replay clock stands in for "now", so data age and staleness work as live.

Live is off unless ``F1_LIVE_ENABLED=1``: it is meant for a backend running on
your own machine, not a public deployment.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import threading
import time
from pathlib import Path

import pandas as pd

from .adapter import SignalRLiveAdapter
from .history import GapHistory

log = logging.getLogger("f1api.live")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_REPLAY = BACKEND_DIR / "tests" / "fixtures" / "sao_paulo_2026_race.jsonl.gz"


def load_env(path: Path = BACKEND_DIR / ".env") -> None:
    """``KEY=VALUE`` lines from ``backend/.env`` into the environment (set values win)."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def live_enabled() -> bool:
    return os.environ.get("F1_LIVE_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def read_recording(path: Path) -> list[tuple[str, object, str | None]]:
    """``(topic, payload, timestamp)`` entries; ``__snapshot__`` entries are subscription snapshots."""
    opener = gzip.open if path.suffix == ".gz" else open
    entries = []
    with opener(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                topic, payload, stamp = json.loads(line)
            except (json.JSONDecodeError, TypeError, ValueError):
                continue  # a torn final line
            entries.append((topic, payload, stamp))
    return entries


def _stamp(value) -> pd.Timestamp | None:
    stamp = pd.to_datetime(value, utc=True, errors="coerce")
    return None if pd.isna(stamp) else stamp


class Replay:
    """Feeds a recording into an adapter on a thread, ``speed`` times real time."""

    def __init__(
        self,
        adapter: SignalRLiveAdapter,
        path: Path,
        speed: float = 1.0,
        skip_s: float = 0.0,
        history: GapHistory | None = None,
    ):
        self.adapter = adapter
        self.history = history
        self.path = path
        self.speed = max(float(speed), 0.1)
        self.skip_s = max(float(skip_s), 0.0)
        self.clock: pd.Timestamp | None = None  # the recorded moment fed last
        self.start: pd.Timestamp | None = None
        self.end: pd.Timestamp | None = None
        self.done = False
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start_async(self) -> None:
        self._thread = threading.Thread(target=self._run, name="live-replay", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def feed_all(self) -> None:
        """Everything at once, without pacing (tests)."""
        self.speed = float("inf")
        self._run()

    def _run(self) -> None:
        entries = read_recording(self.path)
        stamps = [s for s in (_stamp(e[2]) for e in entries if e[0] != "__snapshot__") if s is not None]
        if stamps:
            self.start, self.end = min(stamps), max(stamps)
        origin = self.start + pd.to_timedelta(self.skip_s, unit="s") if self.start is not None else None
        wall_start = time.monotonic()
        for topic, payload, stamp in entries:
            if self._stop.is_set():
                return
            if topic == "__snapshot__":
                if payload:
                    self.adapter.seed_state(payload)
                continue
            moment = _stamp(stamp)
            if moment is not None and origin is not None and moment > origin and math_finite(self.speed):
                due = (moment - origin).total_seconds() / self.speed
                wait = due - (time.monotonic() - wall_start)
                if wait > 0 and self._stop.wait(wait):
                    return
            self.adapter.handle_message(topic, payload, stamp)
            if moment is not None:
                self.clock = moment
                if self.history is not None:
                    self.history.maybe_sample(self.adapter, moment)
        self.done = True


def math_finite(value: float) -> bool:
    return value != float("inf")


class LiveService:
    """The process-wide feed. Browser polls only read from it."""

    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.adapter = SignalRLiveAdapter()
        self.mode = "off"
        self.replay: Replay | None = None
        self.history = GapHistory()
        self._sampler_stop = threading.Event()
        self._sampler: threading.Thread | None = None

    def _sample_live(self) -> None:
        """Live: sample the gaps once a second of wall clock (replay samples in its own loop)."""
        while not self._sampler_stop.wait(1.0):
            try:
                self.history.maybe_sample(self.adapter, pd.Timestamp.now(tz="UTC"))
            except Exception as exc:  # one bad sample must not end the history
                log.warning("Gap sample failed: %s", exc)

    def now(self) -> pd.Timestamp:
        """Wall clock live; the replay's recorded moment in replay."""
        if self.mode == "replay" and self.replay is not None and self.replay.clock is not None:
            return self.replay.clock
        return pd.Timestamp.now(tz="UTC")

    def stop(self) -> None:
        with self.lock:
            self._sampler_stop.set()
            if self._sampler is not None:
                self._sampler.join(timeout=5)
                self._sampler = None
            self.history.clear()
            if self.replay is not None:
                self.replay.stop()
                self.replay = None
            if self.adapter.is_running():
                self.adapter.stop()
            self.adapter = SignalRLiveAdapter()
            self.mode = "off"

    def start_live(self) -> None:
        with self.lock:
            self.stop()
            self.adapter.start_async()
            self._sampler_stop = threading.Event()
            self._sampler = threading.Thread(target=self._sample_live, name="gap-sampler", daemon=True)
            self._sampler.start()
            self.mode = "live"
            log.info("Live feed started")

    def start_replay(self, path: Path = DEFAULT_REPLAY, speed: float = 1.0, skip_s: float = 0.0) -> None:
        if not path.is_file():
            raise FileNotFoundError(f"no recording at {path}")
        with self.lock:
            self.stop()
            self.replay = Replay(self.adapter, path, speed, skip_s, history=self.history)
            self.replay.start_async()
            self.mode = "replay"
            log.info("Replaying %s at %sx", path.name, speed)

    def status(self) -> dict:
        with self.lock:
            out = {"mode": self.mode, "feed": "off", "text": "Not started"}
            if self.mode == "live":
                out["feed"] = self.adapter.status().value
                out["text"] = self.adapter.status_text()
            elif self.mode == "replay" and self.replay is not None:
                replay = self.replay
                out["feed"] = "replay_done" if replay.done else "replay"
                out["text"] = f"Replaying {replay.path.name} at {replay.speed:g}x"
                out["replay"] = {
                    "file": replay.path.name,
                    "speed": replay.speed,
                    "clock": None if replay.clock is None else replay.clock.isoformat(),
                    "start": None if replay.start is None else replay.start.isoformat(),
                    "end": None if replay.end is None else replay.end.isoformat(),
                    "done": replay.done,
                }
            return out


service = LiveService()
