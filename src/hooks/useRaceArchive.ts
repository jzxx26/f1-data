"use client";

import {
  openf1Client,
  type Driver,
  type LapData,
  type LapTelemetry,
  type PositionData,
  type RaceMeeting,
  type Session,
  type SessionResultData,
  type StintData,
  type WeatherData,
} from "@/lib/openf1";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useLiveTelemetry } from "./useLiveTelemetry";

export interface RaceFilters {
  year?: number;
  driverNumber?: number;
  circuit?: string;
}

export function useRaceMeetings(filters: RaceFilters) {
  return useQuery<RaceMeeting[]>({
    queryKey: ["openf1", "meetings", filters],
    queryFn: async () => {
      const meetings = await openf1Client.getRaceMeetings({
        year: filters.year,
      });

      const raceMeetings = meetings.filter((meeting) => {
        const name = meeting.meeting_name?.toLowerCase() ?? "";
        return !name.includes("testing");
      });

      const circuitSearch = filters.circuit?.trim().toLowerCase();
      let filtered = circuitSearch
        ? raceMeetings.filter((meeting) => {
            const circuit = meeting.circuit_short_name ?? "";
            const location = meeting.location ?? "";
            const name = meeting.meeting_name ?? "";
            return [circuit, location, name]
              .map((value) => value.toLowerCase())
              .some((value) => value.includes(circuitSearch));
          })
        : raceMeetings;

      if (filters.driverNumber) {
        const allowedMeetingKeys = new Set(
          raceMeetings.map((meeting) => meeting.meeting_key)
        );
        const driverResults = await openf1Client.getDriverSessionResults(
          filters.driverNumber
        );
        const meetingKeys = new Set(
          driverResults
            .map((result) => result.meeting_key)
            .filter(
              (value): value is number =>
                typeof value === "number" && allowedMeetingKeys.has(value)
            )
        );

        filtered = filtered.filter((meeting) =>
          meetingKeys.has(meeting.meeting_key)
        );
      }

      return [...filtered].sort((a, b) => {
        const aTime = new Date(a.date_start).getTime();
        const bTime = new Date(b.date_start).getTime();
        return bTime - aTime;
      });
    },
    staleTime: 10 * 60_000,
  });
}

export function useMeetingRaceSession(meetingKey?: number, sessionType: string = "Race") {
  return useQuery<Session | null>({
    queryKey: ["openf1", "meeting-session", meetingKey, sessionType],
    queryFn: async () => {
      if (!meetingKey) return null;
      const sessions = await openf1Client.getSessions({
        meeting_key: meetingKey,
        session_type: sessionType,
      });
      return sessions.at(0) ?? null;
    },
    enabled: Boolean(meetingKey),
    staleTime: 10 * 60_000,
  });
}

export function useMeetingDrivers(sessionKey?: number) {
  return useQuery<Driver[]>({
    queryKey: ["openf1", "meeting-drivers", sessionKey],
    queryFn: () => {
      if (!sessionKey) return Promise.resolve([]);
      return openf1Client.getDrivers(sessionKey);
    },
    enabled: Boolean(sessionKey),
    staleTime: 30 * 60_000,
  });
}

export function useRaceTelemetry(sessionKey?: number, drivers?: Driver[]) {
  const telemetry = useLiveTelemetry(sessionKey, drivers, {
    refetchInterval: false,
  });
  return useMemo(
    () => ({
      ...telemetry,
      // disable polling for archive view
      refetch: telemetry.refetch,
    }),
    [telemetry]
  );
}

export function useSessionStints(sessionKey?: number) {
  return useQuery<StintData[]>({
    queryKey: ["openf1", "stints", sessionKey],
    queryFn: () => {
      if (!sessionKey) return Promise.resolve([]);
      return openf1Client.getStints(sessionKey);
    },
    enabled: Boolean(sessionKey),
    staleTime: 30 * 60_000,
  });
}

/**
 * Fetch ALL laps for a session (for use by delta, deg, sector charts).
 * Uses longer staleTime since archive data doesn't change.
 */
export function useSessionLaps(sessionKey?: number, driverNumbers?: number[]) {
  const driverKey = driverNumbers?.sort().join("-") ?? "all";
  return useQuery<LapData[]>({
    queryKey: ["openf1", "session-laps", sessionKey, driverKey],
    queryFn: async () => {
      if (!sessionKey) return [];
      return openf1Client.getLaps(sessionKey, driverNumbers, 200);
    },
    enabled: Boolean(sessionKey),
    staleTime: 30 * 60_000,
  });
}

/** All laps for a session, unfiltered by driver — used by results / pace / position views. */
export function useSessionLapsAll(sessionKey?: number) {
  return useQuery<LapData[]>({
    queryKey: ["openf1", "session-laps-all", sessionKey],
    queryFn: () => {
      if (!sessionKey) return Promise.resolve([]);
      return openf1Client.getLaps(sessionKey, undefined, 200);
    },
    enabled: Boolean(sessionKey),
    staleTime: 30 * 60_000,
  });
}

export function useSessionResults(sessionKey?: number) {
  return useQuery<SessionResultData[]>({
    queryKey: ["openf1", "session-results", sessionKey],
    queryFn: () => {
      if (!sessionKey) return Promise.resolve([]);
      return openf1Client.getSessionResults(sessionKey);
    },
    enabled: Boolean(sessionKey),
    staleTime: 30 * 60_000,
  });
}

/**
 * Fetch the fastest-lap telemetry (X/Y position, speed, distance-aligned time)
 * for the selected drivers — powers the quali track-dominance / delta views.
 */
export function useFastestLapTelemetry(sessionKey?: number, drivers?: Driver[]) {
  const driverNums = drivers?.map((d) => d.driver_number) ?? [];
  const driverKey = [...driverNums].sort((a, b) => a - b).join("-");
  return useQuery<LapTelemetry[]>({
    queryKey: ["fastf1", "lap-telemetry", sessionKey, driverKey],
    queryFn: async () => {
      if (!sessionKey || driverNums.length === 0) return [];
      const results = await Promise.all(
        driverNums.map((n) => openf1Client.getLapTelemetry(sessionKey, n))
      );
      return results.filter(
        (r): r is LapTelemetry => r !== null && r.points.length > 0
      );
    },
    enabled: Boolean(sessionKey) && driverNums.length > 0,
    staleTime: 30 * 60_000,
  });
}

export function useSessionPositions(sessionKey?: number) {
  return useQuery<PositionData[]>({
    queryKey: ["openf1", "session-positions", sessionKey],
    queryFn: () => {
      if (!sessionKey) return Promise.resolve([]);
      return openf1Client.getPositions(sessionKey);
    },
    enabled: Boolean(sessionKey),
    staleTime: 30 * 60_000,
  });
}

export function useSessionWeather(sessionKey?: number) {
  return useQuery<WeatherData[]>({
    queryKey: ["openf1", "session-weather", sessionKey],
    queryFn: () => {
      if (!sessionKey) return Promise.resolve([]);
      return openf1Client.getWeather(sessionKey);
    },
    enabled: Boolean(sessionKey),
    staleTime: 30 * 60_000,
  });
}
