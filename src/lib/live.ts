// Client for the backend's /live endpoints (backend/live/api.py).
// The browser only talks to your own backend; the backend holds the single
// connection to F1's live timing and the F1TV token, which never reaches here.

const BASE = process.env.NEXT_PUBLIC_FASTF1_BASE_URL ?? "";

export type FeedMode = "off" | "live" | "replay";

export interface LiveStatus {
  enabled: boolean;
  mode: FeedMode;
  feed: string;
  text: string;
  token: { set: boolean; expires: string | null; expired: boolean };
  replay?: {
    file: string;
    speed: number;
    clock: string | null;
    start: string | null;
    end: string | null;
    done: boolean;
  };
}

export interface LiveSession {
  gp: string;
  country: string | null;
  circuit: string | null;
  session_name: string;
  session_type: string;
  status: string;
  current_lap: number | null;
  total_laps: number | null;
  clock_remaining: string | null;
  flag: string;
  track_message: string | null;
  last_heartbeat: string | null;
  data_age_s: number | null;
  is_race: boolean;
}

export interface LiveDriver {
  driver_number: string;
  name_acronym: string;
  team_colour: string;
  team_name: string;
  full_name: string;
}

export interface StandingRow {
  Driver: string;
  Position: number;
  Gap: string;
  GapSeconds: number | null;
  LapsDown: number;
  Interval: string;
  IntervalSeconds: number | null;
  BestLap: string;
  LastLap: string;
  LastFlag: "sb" | "pb" | null;
  Status: string;
  Pits: number | null;
}

export interface Tyre {
  compound: string | null;
  age: number | null;
  new: boolean | null;
  stint: number | null;
}

export interface RaceControlMessage {
  Time?: string | null;
  Lap?: number | null;
  Category?: string | null;
  Flag?: string | null;
  Message?: string | null;
}

export interface LiveSnapshot {
  session: LiveSession;
  drivers: LiveDriver[];
  standings: StandingRow[];
  tyres: Record<string, Tyre>;
  pit_lane_times: { Driver: string; Lap: number | null; Duration: number | null }[];
  race_control: RaceControlMessage[];
  weather: Record<string, number | string | null> | null;
}

export interface TelemetrySample {
  t: number;
  Speed?: number | null;
  Throttle?: number | null;
  Brake?: number | null;
  RPM?: number | null;
  nGear?: number | null;
  DRS?: number | null;
}

export interface LiveTelemetry {
  has_data: boolean;
  drivers: Record<string, TelemetrySample[]>;
}

export interface LivePositions {
  has_data: boolean;
  cars: { driver: string; x: number; y: number }[];
  outline: [number, number][];
}

export interface Neighbour {
  driver: string;
  position: number;
  gap: number | null;
  delta: number | null;
  status: string;
}

export interface RejoinPrediction {
  driver: string;
  status: "ok" | "uncertain" | "unavailable" | "unsupported";
  net_pit_loss: number;
  reason: string;
  current_position: number | null;
  current_gap: number | null;
  rejoin_gap: number | null;
  position: number | null;
  position_range: [number, number] | null;
  ahead: Neighbour[];
  behind: Neighbour[];
  projected_order: Neighbour[];
  warnings: string[];
  assumptions: string[];
  loss_to_drop: number | null;
  loss_to_gain: number | null;
  drop_to: string | null;
  gain_on: string | null;
  places_lost: number | null;
}

export interface DriverSummary {
  driver: string;
  number: string | null;
  position: number;
  status: string;
  gap: number | null;
  laps_down: number;
  ahead: string | null;
  to_ahead: number | null;
  behind: string | null;
  to_behind: number | null;
  compound: string | null;
  tyre_age: number | null;
  tyre_new: boolean | null;
  pits: number | null;
  team_colour: string | null;
}

export interface StrategyResponse {
  driver: string;
  summary: DriverSummary | null;
  prediction: RejoinPrediction;
  scenarios: {
    net_pit_loss: number;
    position: number | null;
    position_range: [number, number] | null;
    status: string;
  }[];
  net_loss: {
    value: number;
    default: number;
    range: [number, number];
    note: string;
    check: string | null;
  };
  observed_pit_lane: { median: number | null; stops: number };
  stale: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE) {
    throw new Error("NEXT_PUBLIC_FASTF1_BASE_URL is not set: point it at your local backend.");
  }
  const response = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // not JSON
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export const liveClient = {
  status: () => request<LiveStatus>("/live/status"),
  start: (body: { mode: "live" | "replay"; speed?: number; skip_s?: number }) =>
    request<LiveStatus>("/live/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  stop: () => request<LiveStatus>("/live/stop", { method: "POST" }),
  snapshot: () => request<LiveSnapshot>("/live/snapshot"),
  telemetry: (drivers: string[], seconds = 60) =>
    request<LiveTelemetry>(
      `/live/telemetry?drivers=${encodeURIComponent(drivers.join(","))}&seconds=${seconds}`
    ),
  positions: () => request<LivePositions>("/live/positions"),
  strategy: (driver: string, netLoss: number) =>
    request<StrategyResponse>(
      `/live/strategy?driver=${encodeURIComponent(driver)}&net_loss=${netLoss}`
    ),
};

/** A position or an honest range: "P5", "P2–P3", or an en dash. */
export function placeText(position: number | null, range: [number, number] | null): string {
  if (position !== null) return `P${position}`;
  if (range) return `P${range[0]}–P${range[1]}`;
  return "–";
}

export function teamColour(drivers: LiveDriver[], code: string): string {
  const colour = drivers.find((d) => d.name_acronym === code)?.team_colour;
  return colour && /^#[0-9a-fA-F]{6}$/.test(colour) ? colour : "#6b7280";
}
