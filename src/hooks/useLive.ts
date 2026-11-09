"use client";

import { liveClient } from "@/lib/live";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Poll rates. The backend answers from memory; F1 is never polled.
const STATUS_MS = 2000;
const SNAPSHOT_MS = 1500;
const TELEMETRY_MS = 1000;

export function useLiveStatus() {
  return useQuery({
    queryKey: ["live", "status"],
    queryFn: liveClient.status,
    refetchInterval: STATUS_MS,
    staleTime: 0,
  });
}

export function useLiveSnapshot(active: boolean) {
  return useQuery({
    queryKey: ["live", "snapshot"],
    queryFn: liveClient.snapshot,
    enabled: active,
    refetchInterval: active ? SNAPSHOT_MS : false,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useLiveTelemetry(active: boolean, drivers: string[]) {
  return useQuery({
    queryKey: ["live", "telemetry", drivers],
    queryFn: () => liveClient.telemetry(drivers),
    enabled: active && drivers.length > 0,
    refetchInterval: active ? TELEMETRY_MS : false,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useLivePositions(active: boolean) {
  return useQuery({
    queryKey: ["live", "positions"],
    queryFn: liveClient.positions,
    enabled: active,
    refetchInterval: active ? TELEMETRY_MS : false,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useLiveGaps(active: boolean, drivers: string[], minutes = 30) {
  return useQuery({
    queryKey: ["live", "gaps", drivers, minutes],
    queryFn: () => liveClient.gaps(drivers, minutes),
    enabled: active,
    refetchInterval: active ? 2000 : false,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useLiveStrategy(active: boolean, driver: string | null, netLoss: number) {
  return useQuery({
    queryKey: ["live", "strategy", driver, netLoss],
    queryFn: () => liveClient.strategy(driver as string, netLoss),
    enabled: active && Boolean(driver),
    refetchInterval: active ? SNAPSHOT_MS : false,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** The race-pace model: laps change about once a minute, so a slow poll is plenty. */
export function useLivePace(active: boolean) {
  return useQuery({
    queryKey: ["live", "pace"],
    queryFn: liveClient.pace,
    enabled: active,
    refetchInterval: active ? 10_000 : false,
    placeholderData: keepPreviousData,
  });
}

export function useLiveProjection(active: boolean, driver: string | null, netLoss: number) {
  return useQuery({
    queryKey: ["live", "projection", driver, netLoss],
    queryFn: () => liveClient.projection(driver as string, netLoss),
    enabled: active && Boolean(driver),
    refetchInterval: active ? 5_000 : false,
    placeholderData: keepPreviousData,
  });
}

/** Past races at this circuit: fetched once per event (the backend caches it on disk). */
export function usePitLossHistory(active: boolean, event: string | undefined, year: number | null | undefined) {
  return useQuery({
    queryKey: ["live", "pit-loss-history", event, year],
    queryFn: () => liveClient.pitLossHistory(event as string, year as number),
    enabled: active && Boolean(event) && event !== "Live session" && Boolean(year),
    staleTime: Infinity,
    retry: 1,
  });
}

export function useLiveRecordings(enabled: boolean) {
  return useQuery({
    queryKey: ["live", "recordings"],
    queryFn: liveClient.recordings,
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 10_000,
  });
}

export function useLiveControls() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["live"] });
  const start = useMutation({ mutationFn: liveClient.start, onSuccess: refresh });
  const stop = useMutation({ mutationFn: liveClient.stop, onSuccess: refresh });
  const pause = useMutation({ mutationFn: liveClient.pause, onSuccess: refresh });
  const resume = useMutation({ mutationFn: liveClient.resume, onSuccess: refresh });
  const speed = useMutation({ mutationFn: liveClient.speed, onSuccess: refresh });
  const seek = useMutation({ mutationFn: liveClient.seek, onSuccess: refresh });
  return { start, stop, pause, resume, speed, seek };
}
