// Single data source: self-hosted FastF1 backend.
// Set NEXT_PUBLIC_FASTF1_BASE_URL to its base URL (e.g. http://localhost:8000).
const FASTF1_BACKEND_URL = process.env.NEXT_PUBLIC_FASTF1_BASE_URL ?? "";

if (!FASTF1_BACKEND_URL && typeof window !== "undefined") {
  console.error(
    "❌ NEXT_PUBLIC_FASTF1_BASE_URL is not set — the FastF1 backend is required."
  );
}

export type Primitive = string | number | boolean | undefined | null;
export type QueryParams = Record<string, Primitive | Primitive[]>;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson<T>(
  path: string,
  params?: QueryParams,
  retryCount = 0
): Promise<T> {
  if (!FASTF1_BACKEND_URL) {
    throw new Error(
      "FastF1 backend URL is not configured. Set NEXT_PUBLIC_FASTF1_BASE_URL."
    );
  }
  const url = buildUrl(FASTF1_BACKEND_URL, path, params);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (response.ok) {
    return response.json();
  }

  // Treat 404 as empty so the UI renders rather than erroring.
  if (response.status === 404) {
    return [] as unknown as T;
  }

  // Backoff on 429/5xx — the FastF1 backend cold-starts on Render free tier.
  if (
    (response.status === 429 || response.status >= 500) &&
    retryCount < 3
  ) {
    await delay(Math.pow(2, retryCount) * 1000);
    return fetchJson<T>(path, params, retryCount + 1);
  }

  throw new Error(`FastF1 backend request failed: ${response.status}`);
}

function buildUrl(base: string, path: string, params?: QueryParams) {
  const url = new URL(path.replace(/^\//, ""), `${base.replace(/\/$/, "")}/`);
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item === undefined || item === null || item === "") return;
          searchParams.append(key, String(item));
        });
        return;
      }
      searchParams.set(key, String(value));
    });
    
    let queryString = searchParams.toString();
    queryString = queryString
      .replace(/%3E%3D=/g, ">=")
      .replace(/%3C%3D=/g, "<=")
      .replace(/%3E=/g, ">")
      .replace(/%3C=/g, "<");
      
    url.search = queryString;
  }
  return url.toString();
}

export interface Session {
  session_key: number;
  meeting_key: number;
  date_start: string;
  date_end: string;
  session_type: string;
  session_name: string;
  location: string;
  country_name: string;
  circuit_short_name: string;
  year?: number;
}

export interface Driver {
  driver_number: number;
  broadcast_name: string;
  name_acronym: string;
  team_name: string;
  team_colour?: string;
  headshot_url?: string;
  full_name?: string;
}

export interface LapData {
  driver_number: number;
  lap_number: number;
  lap_duration?: number;
  is_pit_out_lap?: boolean;
  st_speed?: number;
  date_start?: string;
  i1_speed?: number;
  i2_speed?: number;
  duration_sector_1?: number;
  duration_sector_2?: number;
  duration_sector_3?: number;
}

export interface StintData {
  driver_number: number;
  stint_number: number;
  compound?: string;
  lap_start?: number;
  lap_end?: number;
  tyre_age_at_start?: number;
}

export interface IntervalData {
  driver_number: number;
  gap_to_leader: number | string | null;
  interval: number | string | null;
  date: string;
  session_key: number;
  meeting_key: number;
}

export interface SessionResultData {
  driver_number: number;
  position: number;
  number_of_laps?: number;
  duration?: number | number[];
  gap_to_leader?: number | string | (number | string)[];
  dnf?: boolean;
  dsq?: boolean;
  dns?: boolean;
  meeting_key?: number;
  session_key?: number;
  points?: number;
  q1_time?: number | null;
  q2_time?: number | null;
  q3_time?: number | null;
}

export interface RaceMeeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name?: string;
  date_start: string;
  location: string;
  country_name: string;
  year: number;
  circuit_short_name?: string;
}

export interface CarData {
  date: string;
  session_key: number;
  meeting_key: number;
  driver_number: number;
  speed: number;
  throttle: number;
  brake: number;
  n_gear: number;
  rpm: number;
  drs?: number | null;
}

export interface PositionData {
  driver_number: number;
  position: number | null;
  lap_number: number;
  session_key: number;
  date: string;
}

export interface WeatherData {
  time_seconds?: number;
  air_temp?: number;
  track_temp?: number;
  humidity?: number;
  pressure?: number;
  wind_speed?: number;
  wind_direction?: number;
  rainfall?: boolean;
}

export const openf1Client = {
  async getLatestRaceSession(sessionType?: string): Promise<Session | null> {
    const currentYear = new Date().getFullYear();
    let sessions: Session[] = [];
    // Walk back up to 3 years so the dashboard never goes blank between seasons.
    for (let offset = 0; offset <= 3; offset += 1) {
      sessions = await fetchJson<Session[]>("sessions", {
        year: currentYear - offset,
      });
      if (sessions.length > 0) break;
    }

    if (sessions.length === 0) {
      return null;
    }

    const filtered = sessionType
      ? sessions.filter((s) => s.session_type === sessionType)
      : sessions;

    if (filtered.length === 0) {
      return sessions.at(-1) ?? null;
    }

    return (
      filtered
        .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime())
        .at(0) ?? null
    );
  },

  async getMostRecentCompletedRaceSession(
    excludeMeetingKey?: number,
    sessionType?: string
  ): Promise<Session | null> {
    const currentYear = new Date().getFullYear();
    let sessions: Session[] = [];
    for (let offset = 0; offset <= 3; offset += 1) {
      sessions = await fetchJson<Session[]>("sessions", {
        year: currentYear - offset,
      });
      if (sessions.length > 0) break;
    }

    const now = Date.now();

    const completed = sessions
      .filter((session) => {
        if (sessionType) {
          if (session.session_type !== sessionType) return false;
        } else {
          if (session.session_type !== "Race" && session.session_type !== "Qualifying") {
            return false;
          }
        }
        if (excludeMeetingKey && session.meeting_key === excludeMeetingKey) {
          return false;
        }
        if (!session.date_end) return false;
        const endTime = new Date(session.date_end).getTime();
        return Number.isFinite(endTime) && endTime <= now;
      })
      .sort((a, b) => {
        const aTime = new Date(a.date_end ?? a.date_start ?? 0).getTime();
        const bTime = new Date(b.date_end ?? b.date_start ?? 0).getTime();
        return bTime - aTime;
      });

    if (completed.length > 0) {
      return completed[0];
    }

    return (
      sessions
        .filter((session) => session.meeting_key !== excludeMeetingKey)
        .sort((a, b) => {
          const aTime = new Date(a.date_start).getTime();
          const bTime = new Date(b.date_start).getTime();
          return bTime - aTime;
        })
        .at(0) ?? null
    );
  },

  async getSessions(params: QueryParams): Promise<Session[]> {
    return fetchJson<Session[]>("sessions", params);
  },

  async getDrivers(sessionKey: number): Promise<Driver[]> {
    return fetchJson<Driver[]>("drivers", { session_key: sessionKey });
  },

  async getLaps(
    sessionKey: number,
    driverNumbers?: number[],
    limit = 200
  ): Promise<LapData[]> {
    try {
      const allLaps = await fetchJson<LapData[]>("laps", {
        session_key: sessionKey,
      });

      let filtered = allLaps;

      if (driverNumbers && driverNumbers.length > 0) {
        filtered = filtered.filter((lap) =>
          driverNumbers.includes(lap.driver_number)
        );
      }

      filtered = filtered.filter((lap) => lap.lap_number <= limit);

      return filtered;
    } catch (error) {
      console.error("❌ Failed to fetch laps:", error);
      return [];
    }
  },

  async getIntervals(sessionKey: number): Promise<IntervalData[]> {
    return fetchJson<IntervalData[]>("intervals", {
      session_key: sessionKey,
    });
  },

  async getStints(sessionKey: number): Promise<StintData[]> {
    return fetchJson<StintData[]>("stints", {
      session_key: sessionKey,
    });
  },

  async getRaceMeetings(params: QueryParams): Promise<RaceMeeting[]> {
    return fetchJson<RaceMeeting[]>("meetings", params);
  },

  async getSessionResults(sessionKey: number): Promise<SessionResultData[]> {
    return fetchJson<SessionResultData[]>("session_result", {
      session_key: sessionKey,
    });
  },

  async getDriverSessionResults(
    driverNumber: number
  ): Promise<SessionResultData[]> {
    return fetchJson<SessionResultData[]>("session_result", {
      driver_number: driverNumber,
    });
  },

  async getCarData(
    sessionKey: number,
    driverNumber: number,
    lapNumber: number
  ): Promise<CarData[]> {
    return fetchJson<CarData[]>("car_data", {
      session_key: sessionKey,
      driver_number: driverNumber,
      lap_number: lapNumber,
    });
  },

  async getPositions(sessionKey: number): Promise<PositionData[]> {
    return fetchJson<PositionData[]>("position", { session_key: sessionKey });
  },

  async getWeather(sessionKey: number): Promise<WeatherData[]> {
    return fetchJson<WeatherData[]>("weather", { session_key: sessionKey });
  },
};
