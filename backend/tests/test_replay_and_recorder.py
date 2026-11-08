"""Roadmap #1 and #2: Go live records every session; replays pause, change speed and seek."""

import json
import sys
import time
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from live.adapter import SignalRLiveAdapter  # noqa: E402
from live.history import GapHistory  # noqa: E402
from live.service import DEFAULT_REPLAY, Replay, lap_index, read_recording, service  # noqa: E402


def _lap(adapter) -> int | None:
    return (adapter.state.get("LapCount") or {}).get("CurrentLap")


def _wait(condition, timeout=60.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.05)
    return False


@pytest.fixture(scope="module")
def entries():
    return read_recording(DEFAULT_REPLAY)


@pytest.fixture
def replay():
    adapter = SignalRLiveAdapter()
    replay = Replay(adapter, DEFAULT_REPLAY, speed=1.0, history=GapHistory())
    replay.start_async()
    yield replay
    replay.stop()


def test_the_recording_knows_its_laps(entries):
    laps = lap_index(entries)

    assert min(laps) == 38 and max(laps) == 57
    assert list(laps.values()) == sorted(laps.values())


def test_seek_forward_and_back(replay):
    replay.seek_lap(50)
    assert _wait(lambda: _lap(replay.adapter) == 50)
    history_at_50 = len(replay.history.samples)

    replay.seek_lap(40)  # back: the state is rebuilt from the start
    assert _wait(lambda: _lap(replay.adapter) == 40)

    assert len(replay.history.samples) < history_at_50
    assert replay.history.samples[-1]["lap"] <= 40


def test_pause_holds_the_clock(replay):
    replay.set_speed(60)
    assert _wait(lambda: replay.clock is not None)
    replay.pause()
    time.sleep(0.3)
    held = replay.clock

    time.sleep(1.0)

    assert replay.clock == held
    replay.resume()
    assert _wait(lambda: replay.clock != held, timeout=10)


def test_speed_changes_while_playing(replay):
    assert _wait(lambda: replay.clock is not None)
    replay.set_speed(100)
    start = replay.clock

    time.sleep(1.5)

    # 1.5 s at 100x is minutes of race, far beyond what 1x would cover
    assert (replay.clock - start).total_seconds() > 30


def test_a_finished_replay_can_seek_back():
    adapter = SignalRLiveAdapter()
    replay = Replay(adapter, DEFAULT_REPLAY, speed=120.0)
    replay.start_async()
    try:
        replay.seek_lap(57)
        assert _wait(lambda: replay.done, timeout=90)

        replay.seek_lap(45)

        assert _wait(lambda: _lap(adapter) == 45)
        assert not replay.done
    finally:
        replay.stop()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("F1_LIVE_ENABLED", "1")
    return TestClient(main.app, base_url="http://localhost")


def test_go_live_records_each_session(client, monkeypatch, tmp_path, entries):
    monkeypatch.setenv("F1_LIVE_RECORD_DIR", str(tmp_path))
    monkeypatch.setattr(SignalRLiveAdapter, "start_async", lambda self, *a, **k: None)
    service.stop()
    assert client.post("/live/start", json={"mode": "live"}).status_code == 200

    # What the SignalR client would hand over: the snapshot, then messages.
    snapshot = next(payload for topic, payload, _ in entries if topic == "__snapshot__" and payload)
    service.adapter.seed_state(snapshot)
    fed = 0
    for topic, payload, stamp in entries:
        if topic != "__snapshot__" and fed < 500:
            service.adapter.handle_message(topic, payload, stamp)
            fed += 1
    status = client.get("/live/status").json()
    assert status["recording"]["messages"] == 500

    client.post("/live/stop")

    folders = [p for p in tmp_path.iterdir() if (p / "live.jsonl").is_file()]
    assert len(folders) == 1 and "Race" in folders[0].name
    listed = client.get("/live/recordings").json()["recordings"]
    assert listed[0]["label"] == folders[0].name

    assert client.post("/live/start", json={"mode": "replay", "file": listed[0]["name"], "speed": 60}).status_code == 200
    assert _wait(lambda: _lap(service.adapter) is not None)
    client.post("/live/stop")


def test_an_older_recording_starts_from_subscribe_json(tmp_path, entries):
    snapshot = next(payload for topic, payload, _ in entries if topic == "__snapshot__" and payload)
    (tmp_path / "subscribe.json").write_text(json.dumps(snapshot))
    with open(tmp_path / "live.jsonl", "w") as handle:
        for topic, payload, stamp in entries[:50]:
            if topic != "__snapshot__":
                handle.write(json.dumps([topic, payload, stamp]) + "\n")

    loaded = read_recording(tmp_path)

    assert loaded[0][0] == "__snapshot__"


def test_replay_controls_need_a_replay(client):
    service.stop()

    assert client.post("/live/replay/pause").status_code == 409
    assert client.post("/live/replay/speed", json={"speed": 500}).status_code in (400, 409)


def test_an_unknown_recording_is_refused(client):
    response = client.post("/live/start", json={"mode": "replay", "file": "../../../etc/passwd"})

    assert response.status_code == 400
