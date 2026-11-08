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

from .adapter import SignalRLiveAdapter, autorecord_enabled
from .history import GapHistory

log = logging.getLogger("f1api.live")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_REPLAY = BACKEND_DIR / "tests" / "fixtures" / "sao_paulo_2026_race.jsonl.gz"
RECORDINGS_DIR = BACKEND_DIR / "recordings"
STREAM_FILE = "live.jsonl"
SNAPSHOT_FILE = "subscribe.json"
SNAPSHOT_TOPIC = "__snapshot__"


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


def recordings_dir() -> Path:
    """Where Go live records each session (``F1_LIVE_RECORD_DIR``, else backend/recordings)."""
    return Path(os.environ.get("F1_LIVE_RECORD_DIR") or RECORDINGS_DIR)


def resolve_recording(path: Path) -> Path:
    """A recording file, or the stream file inside a recording folder."""
    if path.is_dir():
        for name in (STREAM_FILE, STREAM_FILE + ".gz"):
            if (path / name).is_file():
                return path / name
        raise FileNotFoundError(f"no {STREAM_FILE} in {path}")
    return path


def read_recording(path: Path) -> list[tuple[str, object, str | None]]:
    """``(topic, payload, timestamp)`` entries; ``__snapshot__`` entries are subscription snapshots.

    ``path`` is a ``.jsonl``/``.jsonl.gz`` file or a recording folder. A folder
    whose stream has no inline snapshot (older recordings) starts from its
    ``subscribe.json``.
    """
    path = resolve_recording(path)
    opener = gzip.open if path.suffix == ".gz" else open
    entries: list[tuple[str, object, str | None]] = []
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
    snapshot = path.parent / SNAPSHOT_FILE
    if snapshot.is_file() and not any(e[0] == SNAPSHOT_TOPIC for e in entries):
        try:
            entries.insert(0, (SNAPSHOT_TOPIC, json.loads(snapshot.read_text(encoding="utf-8")), None))
        except (OSError, json.JSONDecodeError):
            pass
    return entries


def _stamp(value) -> pd.Timestamp | None:
    stamp = pd.to_datetime(value, utc=True, errors="coerce")
    return None if pd.isna(stamp) else stamp


# Car data and positions are only shown for the last few minutes; when a seek
# fast-forwards, older samples are skipped instead of decoded.
HEAVY_TOPICS = {"CarData.z", "Position.z"}
HEAVY_KEEP_S = 180.0


class Replay:
    """Feeds a recording into an adapter on a thread, ``speed`` times real time.

    Pause, resume, speed and seek can be changed while it plays. Seeking back
    resets the adapter and rebuilds the state from the start of the recording;
    seeking forward feeds on from where it is. Either way the messages before
    the target are fed without waiting, and old car data is skipped.
    """

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
        self.entries = read_recording(path)
        self.moments = [_stamp(e[2]) if e[0] != SNAPSHOT_TOPIC else None for e in self.entries]
        stamps = [m for m in self.moments if m is not None]
        self.start: pd.Timestamp | None = min(stamps) if stamps else None
        self.end: pd.Timestamp | None = max(stamps) if stamps else None
        self.laps = lap_index(self.entries)  # lap -> index of its first message
        self.clock: pd.Timestamp | None = None  # the recorded moment fed last
        self.done = False
        self.paused = False
        self._index = 0
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._seek_to: pd.Timestamp | None = None
        self._anchor: tuple[float, pd.Timestamp] | None = None  # (wall, recorded) pairing
        self._thread: threading.Thread | None = None
        if skip_s and self.start is not None:
            self._seek_to = self.start + pd.to_timedelta(skip_s, unit="s")

    # --- controls (any thread) ---------------------------------------------
    def start_async(self) -> None:
        self._thread = threading.Thread(target=self._run, name="live-replay", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def pause(self) -> None:
        with self._lock:
            self.paused = True
            self._anchor = None
        self._wake.set()

    def resume(self) -> None:
        with self._lock:
            self.paused = False
            self._anchor = None
        self._wake.set()

    def set_speed(self, speed: float) -> None:
        with self._lock:
            self.speed = max(float(speed), 0.1)
            self._anchor = None  # re-pair the clocks at the new speed
        self._wake.set()

    def seek_lap(self, lap: int) -> None:
        """Jump to the first message of ``lap`` (the nearest recorded lap)."""
        if not self.laps:
            raise ValueError("this recording has no lap count")
        nearest = min(self.laps, key=lambda known: abs(known - lap))
        index = self.laps[nearest]
        moment = next((m for m in self.moments[index:] if m is not None), None)
        if moment is not None:
            self.seek_time(moment)

    def seek_time(self, moment: pd.Timestamp) -> None:
        with self._lock:
            self._seek_to = moment
            self._anchor = None
            self.done = False
        self._wake.set()
        if self._thread is not None and not self._thread.is_alive() and not self._stop.is_set():
            self.start_async()  # a finished replay can be sought back into

    def feed_all(self) -> None:
        """Everything at once, without pacing (tests)."""
        self.speed = float("inf")
        self._run()

    # --- the feeding thread -------------------------------------------------
    def _reset(self) -> None:
        adapter = self.adapter
        adapter._reset_session_state()
        adapter._session_id = None
        adapter.last_heartbeat = None
        adapter.snapshots.clear()
        if self.history is not None:
            self.history.clear()
        self._index = 0
        self.clock = None

    def _feed(self, index: int, skip_heavy_before: pd.Timestamp | None = None) -> None:
        topic, payload, stamp = self.entries[index]
        if topic == SNAPSHOT_TOPIC:
            if payload:
                self.adapter.seed_state(payload)
            return
        moment = self.moments[index]
        if skip_heavy_before is not None and topic in HEAVY_TOPICS and moment is not None and moment < skip_heavy_before:
            return
        self.adapter.handle_message(topic, payload, stamp)
        if moment is not None:
            self.clock = moment
            if self.history is not None:
                self.history.maybe_sample(self.adapter, moment)

    def _fast_forward(self, target: pd.Timestamp) -> None:
        if self.clock is not None and target < self.clock:
            self._reset()
        skip_before = target - pd.to_timedelta(HEAVY_KEEP_S, unit="s")
        while self._index < len(self.entries) and not self._stop.is_set():
            moment = self.moments[self._index]
            if moment is not None and moment > target:
                break
            self._feed(self._index, skip_before)
            self._index += 1

    def _run(self) -> None:
        while not self._stop.is_set():
            with self._lock:
                target, self._seek_to = self._seek_to, None
            if target is not None:
                self._fast_forward(target)
                continue
            if self.paused:
                self._wake.wait()
                self._wake.clear()
                continue
            if self._index >= len(self.entries):
                self.done = True
                self._wake.wait()  # until a seek back or stop
                self._wake.clear()
                continue
            moment = self.moments[self._index]
            if moment is not None and math_finite(self.speed):
                with self._lock:
                    if self._anchor is None:
                        self._anchor = (time.monotonic(), self.clock or moment)
                    wall0, rec0 = self._anchor
                    speed = self.speed
                due = wall0 + max((moment - rec0).total_seconds(), 0.0) / speed
                wait = due - time.monotonic()
                if wait > 0:
                    if self._wake.wait(wait):
                        self._wake.clear()
                        continue  # a control changed; re-evaluate
            self._feed(self._index)
            self._index += 1
            if not math_finite(self.speed) and self._index >= len(self.entries):
                self.done = True
                return

    def info(self) -> dict:
        lap = (self.adapter.state.get("LapCount") or {}).get("CurrentLap")
        return {
            "file": recording_name(self.path),
            "speed": self.speed,
            "paused": self.paused,
            "done": self.done,
            "clock": None if self.clock is None else self.clock.isoformat(),
            "start": None if self.start is None else self.start.isoformat(),
            "end": None if self.end is None else self.end.isoformat(),
            "lap": lap,
            "laps": [min(self.laps), max(self.laps)] if self.laps else None,
        }


def math_finite(value: float) -> bool:
    return value != float("inf")


def lap_index(entries: list) -> dict[int, int]:
    """Lap number -> index of the first message at that lap (from LapCount)."""
    laps: dict[int, int] = {}
    for index, (topic, payload, _stamp_value) in enumerate(entries):
        if topic == SNAPSHOT_TOPIC and isinstance(payload, dict):
            payload = payload.get("LapCount")
        elif topic != "LapCount":
            continue
        if isinstance(payload, dict) and payload.get("CurrentLap") is not None:
            try:
                laps.setdefault(int(payload["CurrentLap"]), index)
            except (TypeError, ValueError):
                pass
    return laps


def recording_name(path: Path) -> str:
    """How a recording is named in the UI: its folder for a directory recording."""
    return path.parent.name if path.name in (STREAM_FILE, STREAM_FILE + ".gz") else path.name


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
            self.adapter.stop_recording()
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
            os.environ.setdefault("F1_LIVE_RECORD_DIR", str(recordings_dir()))
            # Every session is recorded, one folder each (F1_LIVE_AUTORECORD=0 turns it off).
            self.adapter.autorecord = autorecord_enabled()
            self.adapter.start_async()
            self._sampler_stop = threading.Event()
            self._sampler = threading.Thread(target=self._sample_live, name="gap-sampler", daemon=True)
            self._sampler.start()
            self.mode = "live"
            log.info("Live feed started")

    def start_replay(self, path: Path = DEFAULT_REPLAY, speed: float = 1.0, skip_s: float = 0.0) -> None:
        path = resolve_recording(path)
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
                recorder = self.adapter.recorder
                out["recording"] = (
                    {"folder": recorder.directory.name, "messages": recorder.message_count}
                    if recorder is not None
                    else None
                )
                if self.adapter.recorder_error:
                    out["recording_error"] = self.adapter.recorder_error
            elif self.mode == "replay" and self.replay is not None:
                replay = self.replay
                out["feed"] = "replay_done" if replay.done else "replay_paused" if replay.paused else "replay"
                state = "finished" if replay.done else "paused" if replay.paused else f"at {replay.speed:g}x"
                out["text"] = f"Replaying {recording_name(replay.path)}, {state}"
                out["replay"] = replay.info()
            return out


service = LiveService()
