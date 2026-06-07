"use client";

import { openf1Client, type Driver, type StintData } from "@/lib/openf1";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface LapDetail {
  driver: Driver;
  lap: number;
  speed?: number;
  compound?: string;
  sectors?: {
    s1?: number;
    s2?: number;
    s3?: number;
  };
  lapTime?: number;
}

interface TelemetryResponse {
  data: Record<string, Array<{ lap: number; speed?: number }>>;
  lapDetails: Record<string, LapDetail>;
}

async function fetchTelemetry(
  sessionKey: number,
  drivers: Driver[]
): Promise<TelemetryResponse> {
  const driverNumbers = drivers.map((driver) => driver.driver_number);
  const [laps, stints] = await Promise.all([
    openf1Client.getLaps(sessionKey, driverNumbers, 200),
    openf1Client.getStints(sessionKey),
  ]);

  const stintsByDriver = groupBy(stints, (stint) => stint.driver_number);
  const response: TelemetryResponse = { data: {}, lapDetails: {} };

  drivers.forEach((driver) => {
    response.data[driver.driver_number] = [];
  });

  laps.forEach((lap) => {
    const driver = drivers.find(
      (item) => item.driver_number === lap.driver_number
    );
    if (!driver) return;

    const lapKey = makeLapKey(lap.driver_number, lap.lap_number);
    const compound = resolveCompound(
      stintsByDriver[lap.driver_number] ?? [],
      lap.lap_number
    );

    response.data[lap.driver_number].push({
      lap: lap.lap_number,
      speed: lap.st_speed ?? lap.i1_speed ?? lap.i2_speed,
    });

    response.lapDetails[lapKey] = {
      driver,
      lap: lap.lap_number,
      speed: lap.st_speed ?? lap.i1_speed ?? lap.i2_speed,
      compound,
      sectors: {
        s1: lap.duration_sector_1,
        s2: lap.duration_sector_2,
        s3: lap.duration_sector_3,
      },
      lapTime: lap.lap_duration,
    };
  });

  return response;
}

function makeLapKey(driverNumber: number, lap: number) {
  return `${driverNumber}-${lap}`;
}

function groupBy<T, Key extends string | number>(
  items: T[],
  getKey: (item: T) => Key
) {
  return items.reduce<Record<Key, T[]>>((acc, item) => {
    const key = getKey(item);
    if (!acc[key]) acc[key] = [] as T[];
    acc[key].push(item);
    return acc;
  }, {} as Record<Key, T[]>);
}

function resolveCompound(stints: StintData[], lap: number) {
  const stint = stints.find((item) => {
    if (item.lap_start && item.lap_end) {
      return lap >= item.lap_start && lap <= item.lap_end;
    }
    if (item.lap_start && !item.lap_end) {
      return lap >= item.lap_start;
    }
    return false;
  });
  return stint?.compound;
}

interface LiveTelemetryOptions {
  refetchInterval?: number | false;
}

export function useLiveTelemetry(
  sessionKey?: number,
  drivers?: Driver[],
  options?: LiveTelemetryOptions
) {
  const driverKey =
    drivers?.map((driver) => driver.driver_number).join("-") ?? "all";

  const { refetchInterval = 15_000 } = options ?? {}; // Changed from 7s to 15s

  const query = useQuery({
    queryKey: ["openf1", "telemetry", sessionKey, driverKey],
    queryFn: () => {
      if (!sessionKey || !drivers || drivers.length === 0) {
        return Promise.resolve<TelemetryResponse>({ data: {}, lapDetails: {} });
      }
      return fetchTelemetry(sessionKey, drivers);
    },
    enabled: Boolean(sessionKey && drivers && drivers.length > 0),
    refetchInterval,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const chartData = useMemo(() => {
    const dataset: Array<Record<string, number | undefined>> = [];
    const detailMap = new Map<string, LapDetail>();

    if (!drivers || !query.data) {
      return { data: dataset, detailMap };
    }

    const lapNumbers = new Set<number>();
    drivers.forEach((driver) => {
      const dataPoints = query.data?.data[driver.driver_number] ?? [];
      dataPoints.forEach((point) => lapNumbers.add(point.lap));
    });

    const sortedLapNumbers = Array.from(lapNumbers).sort((a, b) => a - b);

    sortedLapNumbers.forEach((lap) => {
      const row: Record<string, number | undefined> = { lap };
      drivers.forEach((driver) => {
        const key = makeLapKey(driver.driver_number, lap);
        const detail = query.data?.lapDetails[key];
        if (detail?.speed) {
          row[driver.driver_number] = detail.speed;
          detailMap.set(key, detail);
        }
      });
      dataset.push(row);
    });

    return { data: dataset, detailMap };
  }, [drivers, query.data]);

  return {
    ...query,
    chartData: chartData.data,
    detailMap: chartData.detailMap,
  };
}

export function useDetailedTelemetry(
  sessionKey?: number,
  driverNumber1?: number,
  driverNumber2?: number,
  lapNumber1?: number,
  lapNumber2?: number,
  enabled = true
) {
  const driversToFetch = useMemo(() => {
    const list: number[] = [];
    if (driverNumber1 !== undefined && !Number.isNaN(driverNumber1))
      list.push(driverNumber1);
    if (driverNumber2 !== undefined && !Number.isNaN(driverNumber2))
      list.push(driverNumber2);
    return list;
  }, [driverNumber1, driverNumber2]);

  // Fetch all laps for both drivers so the chart can list lap options + best lap.
  const lapsQuery = useQuery({
    queryKey: ["openf1", "detailed-laps", sessionKey, driversToFetch.join("-")],
    queryFn: () => {
      if (!sessionKey || driversToFetch.length === 0) return Promise.resolve([]);
      return openf1Client.getLaps(sessionKey, driversToFetch, 200);
    },
    enabled: Boolean(enabled && sessionKey && driversToFetch.length > 0),
    staleTime: 60_000,
  });

  // Fetch car data per driver at their own lap number — pole laps for d1 and d2
  // are rarely on the same lap, so we shouldn't force them to share.
  const carDataQuery = useQuery({
    queryKey: [
      "openf1",
      "detailed-car-data",
      sessionKey,
      driverNumber1,
      driverNumber2,
      lapNumber1,
      lapNumber2,
    ],
    queryFn: async () => {
      if (!sessionKey) return [];

      const targets: Array<{ driverNum: number; lap: number }> = [];
      if (driverNumber1 !== undefined && lapNumber1 !== undefined) {
        targets.push({ driverNum: driverNumber1, lap: lapNumber1 });
      }
      if (driverNumber2 !== undefined && lapNumber2 !== undefined) {
        targets.push({ driverNum: driverNumber2, lap: lapNumber2 });
      }

      const promises = targets.map(async ({ driverNum, lap }) => {
        try {
          const data = await openf1Client.getCarData(sessionKey, driverNum, lap);
          return { driverNum, data };
        } catch (err) {
          console.error(`Error fetching car data for driver ${driverNum}:`, err);
          return { driverNum, data: [] };
        }
      });

      return Promise.all(promises);
    },
    enabled: Boolean(
      enabled &&
        sessionKey &&
        ((driverNumber1 !== undefined && lapNumber1 !== undefined) ||
          (driverNumber2 !== undefined && lapNumber2 !== undefined))
    ),
    staleTime: 5 * 60_000,
  });

  return {
    laps: lapsQuery.data ?? [],
    carData: carDataQuery.data ?? [],
    isLoading: lapsQuery.isLoading || carDataQuery.isLoading,
    isFetching: lapsQuery.isFetching || carDataQuery.isFetching,
  };
}
