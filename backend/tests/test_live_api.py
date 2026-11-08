"""The /live endpoints, fed the recorded 2026 Sao Paulo race through the live ingest path.

The recording (tests/fixtures/sao_paulo_2026_race.jsonl.gz) is the raw SignalR
Core stream from lap 38 to lap 57, recorded without a token, so it has timing,
tyres, race control and pit lane times but no car telemetry or positions.
"""

import base64
import json
import sys
import zlib
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from live.service import DEFAULT_REPLAY, Replay, service  # noqa: E402


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("F1_LIVE_ENABLED", "1")
    return TestClient(main.app, base_url="http://localhost")


@pytest.fixture(scope="module")
def _fed():
    """The recording fed once for the module (it takes a while)."""
    service.stop()
    replay = Replay(service.adapter, DEFAULT_REPLAY, history=service.history)
    replay.feed_all()
    service.replay, service.mode = replay, "replay"
    yield
    service.stop()


@pytest.fixture
def replayed(_fed, client):
    return client


def test_live_is_off_unless_enabled(monkeypatch):
    monkeypatch.setenv("F1_LIVE_ENABLED", "0")
    client = TestClient(main.app, base_url="http://localhost")

    assert client.get("/live/snapshot").status_code == 403
    assert client.post("/live/start", json={"mode": "live"}).status_code == 403
    assert client.get("/live/status").json()["enabled"] is False


def test_the_status_never_returns_the_token(client, monkeypatch):
    monkeypatch.setenv("F1TV_SUBSCRIPTION_TOKEN", "not-a-real-token")
    body = client.get("/live/status").text

    assert "not-a-real-token" not in body
    assert '"set":true' in body.replace(" ", "")


def test_the_snapshot_is_the_race_at_the_end_of_the_recording(replayed):
    snap = replayed.get("/live/snapshot").json()

    assert snap["session"]["gp"] == "São Paulo Grand Prix"
    assert snap["session"]["is_race"] is True
    assert snap["session"]["current_lap"] == 57
    assert len(snap["standings"]) == 22
    assert snap["standings"][0]["Driver"] == "NOR"
    assert snap["tyres"]["NOR"]["compound"] == "SOFT"


def test_pit_lane_times_outlive_their_deletion(replayed):
    snap = replayed.get("/live/snapshot").json()

    # PitLaneTimeCollection deletes each stop ~20 s after announcing it.
    assert len(snap["pit_lane_times"]) == 16
    assert {"Driver", "Lap", "Duration"} <= set(snap["pit_lane_times"][0])


def test_the_strategy_adds_the_net_loss_not_the_pit_lane_time(replayed):
    body = replayed.get("/live/strategy", params={"driver": "VER", "net_loss": 20}).json()
    prediction = body["prediction"]

    assert body["observed_pit_lane"] == {"median": 24.0, "stops": 16}
    assert prediction["net_pit_loss"] == 20
    assert prediction["rejoin_gap"] == pytest.approx(prediction["current_gap"] + 20)
    assert [s["net_pit_loss"] for s in body["scenarios"]] == [18, 20, 22]
    assert body["net_loss"]["check"] is None


def test_a_net_loss_above_the_pit_lane_time_is_questioned(replayed):
    body = replayed.get("/live/strategy", params={"driver": "VER", "net_loss": 26}).json()

    assert "at or above the observed pit lane time" in body["net_loss"]["check"]


def test_a_retired_car_has_no_prediction(replayed):
    body = replayed.get("/live/strategy", params={"driver": "STR", "net_loss": 20}).json()

    assert body["prediction"]["status"] == "unavailable"
    assert body["prediction"]["position"] is None


def test_the_recording_has_no_car_data(replayed):
    assert replayed.get("/live/telemetry").json()["has_data"] is False
    assert replayed.get("/live/positions").json()["has_data"] is False


def _zipped(payload) -> str:
    raw = json.dumps(payload).encode()
    compressor = zlib.compressobj(wbits=-zlib.MAX_WBITS)
    return base64.b64encode(compressor.compress(raw) + compressor.flush()).decode()


def test_authenticated_car_data_reaches_the_telemetry_endpoint(replayed):
    # The shape F1 sends with a token: base64 + raw DEFLATE, channels by number.
    payload = {
        "Entries": [
            {
                "Utc": "2026-11-08T18:19:00.5Z",
                "Cars": {"1": {"Channels": {"0": 11000, "2": 301, "3": 7, "4": 100, "5": 0, "45": 0}}},
            }
        ]
    }
    service.adapter.handle_message("CarData.z", _zipped(payload), "2026-11-08T18:19:00.6Z")

    body = replayed.get("/live/telemetry", params={"drivers": "NOR"}).json()

    assert body["has_data"] is True
    assert body["drivers"]["NOR"][0]["Speed"] == 301


def test_a_replay_outside_backend_is_refused(client):
    response = client.post("/live/start", json={"mode": "replay", "file": "../../etc/passwd"})

    assert response.status_code == 400


class TestOnlyThisMachinesFrontend:
    """CORS is * for the whole app, so /live checks Host and Origin itself."""

    def test_another_site_cannot_start_the_feed(self, client):
        response = client.post(
            "/live/start", json={"mode": "live"}, headers={"Origin": "https://evil.example"}
        )

        assert response.status_code == 403
        assert service.mode != "live"

    def test_another_site_cannot_read_it(self, client):
        response = client.get("/live/status", headers={"Origin": "https://evil.example"})

        assert response.status_code == 403

    def test_a_rebound_hostname_is_refused(self, client):
        response = client.get("/live/status", headers={"Host": "attacker.example:8000"})

        assert response.status_code == 403

    def test_the_frontend_and_local_tools_are_let_through(self, client):
        assert client.get("/live/status", headers={"Origin": "http://localhost:3000"}).status_code == 200
        assert client.get("/live/status", headers={"Host": "127.0.0.1:8000"}).status_code == 200
        assert client.get("/live/status").status_code == 200  # no Origin: curl, scripts

    def test_stop_needs_live_enabled(self, monkeypatch):
        monkeypatch.setenv("F1_LIVE_ENABLED", "0")

        assert TestClient(main.app, base_url="http://localhost").post("/live/stop").status_code == 403

    def test_the_rest_of_the_api_is_unchanged(self, client):
        response = client.get("/", headers={"Origin": "https://evil.example"})

        assert response.status_code == 200


class TestGapHistory:
    def test_the_replay_samples_every_two_seconds_of_race_time(self, replayed):
        body = replayed.get("/live/gaps", params={"drivers": "NOR,VER", "minutes": 360}).json()

        assert len(body["t"]) > 300  # ~23 minutes of race at one sample per 2 s
        steps = [b - a for a, b in zip(body["t"], body["t"][1:], strict=False)]
        assert min(steps) >= 2.0
        assert body["t"][-1] == 0.0
        assert set(body["gaps"]) == {"NOR", "VER"}
        assert body["gaps"]["NOR"][-1] == 0.0  # the leader at the end of the recording

    def test_lapped_cars_have_a_gap_from_the_interval_chain(self, replayed):
        body = replayed.get("/live/gaps", params={"drivers": "BEA"}).json()

        assert body["gaps"]["BEA"][-1] is not None and body["gaps"]["BEA"][-1] > 80

    def test_the_window_trims_older_samples(self, replayed):
        short = replayed.get("/live/gaps", params={"minutes": 5}).json()

        assert short["t"][0] >= -300.0
