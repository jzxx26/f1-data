"use client";

import { ChartContainer } from "@/components/common/ChartContainer";
import { getDriverColor, getTyreColor } from "@/lib/colors";
import type { Driver, LapData, StintData } from "@/lib/openf1";
import { formatTime, isFiniteNumber } from "@/lib/utils";
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  type TooltipProps,
} from "recharts";

interface TyreDegChartProps {
  laps: LapData[];
  stints: StintData[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface DegPoint {
  lap: number;
  lapTime: number;
  compound: string;
  driverNumber: number;
  driverAcronym: string;
  color: string;
  tyreAge: number;
}

function resolveCompound(stints: StintData[], lap: number): string | undefined {
  return stints.find((s) => {
    if (s.lap_start && s.lap_end) return lap >= s.lap_start && lap <= s.lap_end;
    if (s.lap_start && !s.lap_end) return lap >= s.lap_start;
    return false;
  })?.compound;
}

function resolveTyreAge(stints: StintData[], lap: number): number {
  const stint = stints.find((s) => {
    if (s.lap_start && s.lap_end) return lap >= s.lap_start && lap <= s.lap_end;
    if (s.lap_start && !s.lap_end) return lap >= s.lap_start;
    return false;
  });
  if (!stint) return 0;
  const startAge = stint.tyre_age_at_start ?? 0;
  const lapsSinceStart = lap - (stint.lap_start ?? lap);
  return startAge + lapsSinceStart;
}

export function TyreDegChart({
  laps,
  stints,
  drivers,
  isLoading,
}: TyreDegChartProps) {
  const scatterData = useMemo(() => {
    if (laps.length === 0 || drivers.length === 0) return [];

    const driverNums = new Set(drivers.map((d) => d.driver_number));
    const stintsByDriver = new Map<number, StintData[]>();
    stints.forEach((s) => {
      if (!driverNums.has(s.driver_number)) return;
      if (!stintsByDriver.has(s.driver_number))
        stintsByDriver.set(s.driver_number, []);
      stintsByDriver.get(s.driver_number)!.push(s);
    });

    // Compute median lap time for outlier filtering
    const validTimes = laps.flatMap((l) =>
      driverNums.has(l.driver_number) &&
      isFiniteNumber(l.lap_duration) &&
      l.lap_duration > 0
        ? [l.lap_duration]
        : [],
    );
    validTimes.sort((a, b) => a - b);
    const median = validTimes[Math.floor(validTimes.length / 2)] ?? 90;
    const upperBound = median * 1.15; // Remove laps > 15% slower than median (SC, pits etc.)

    const points: DegPoint[] = [];
    laps.forEach((lap) => {
      if (!driverNums.has(lap.driver_number)) return;
      if (!isFiniteNumber(lap.lap_number)) return;
      if (!isFiniteNumber(lap.lap_duration) || lap.lap_duration <= 0) return;
      if (lap.is_pit_out_lap) return;
      if (lap.lap_duration > upperBound) return;
      if (lap.lap_number <= 1) return; // Skip formation/start laps

      const driverStints = stintsByDriver.get(lap.driver_number) ?? [];
      const compound =
        resolveCompound(driverStints, lap.lap_number) ?? "UNKNOWN";
      const tyreAge = resolveTyreAge(driverStints, lap.lap_number);
      const driver = drivers.find((d) => d.driver_number === lap.driver_number);

      points.push({
        lap: lap.lap_number,
        lapTime: lap.lap_duration,
        compound: compound.toUpperCase(),
        driverNumber: lap.driver_number,
        driverAcronym: driver?.name_acronym ?? String(lap.driver_number),
        color: driver ? getDriverColor(driver) : "#6b7280",
        tyreAge,
      });
    });

    return points;
  }, [laps, stints, drivers]);

  // Group by driver+compound for separate scatter series
  const seriesGroups = useMemo(() => {
    const map = new Map<string, DegPoint[]>();
    scatterData.forEach((p) => {
      const key = `${p.driverNumber}-${p.compound}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return map;
  }, [scatterData]);

  const hasData = scatterData.length > 0;
  const compounds = useMemo(
    () => [...new Set(scatterData.map((p) => p.compound))],
    [scatterData],
  );
  const lapDomain = useMemo<[number, number]>(() => {
    if (scatterData.length === 0) return [1, 2];
    const values = scatterData.map((p) => p.lap).filter(isFiniteNumber);
    if (values.length === 0) return [1, 2];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? [min - 1, max + 1] : [min, max];
  }, [scatterData]);
  const lapTimeDomain = useMemo<[number, number]>(() => {
    if (scatterData.length === 0) return [0, 1];
    const values = scatterData.map((p) => p.lapTime).filter(isFiniteNumber);
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? [min - 1, max + 1] : [min - 1, max + 1];
  }, [scatterData]);

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0]?.payload as DegPoint | undefined;
    if (!p) return null;
    return (
      <div className="min-w-[200px] rounded-xl border border-white/10 bg-black/90 p-3 text-xs text-white/80 shadow-xl backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="font-semibold text-white">{p.driverAcronym}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-white/50">
            Lap {p.lap}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <span className="text-white/50">Lap Time</span>
          <span className="text-right font-mono text-white/80">
            {formatTime(p.lapTime)}
          </span>
          <span className="text-white/50">Compound</span>
          <span className="flex items-center justify-end gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: getTyreColor(p.compound) }}
            />
            {p.compound}
          </span>
          <span className="text-white/50">Tyre Age</span>
          <span className="text-right text-white/80">{p.tyreAge} laps</span>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/5 bg-zinc-900/60 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex flex-col gap-1 border-b border-white/5 bg-zinc-900/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Race Pace
          </p>
          <h2 className="text-lg font-semibold text-white">Tyre Degradation</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {compounds.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1.5 rounded-full bg-black/40 border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: getTyreColor(c) }}
              />
              {c}
            </span>
          ))}
          <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
            {isLoading ? "Loading…" : `${scatterData.length} pts`}
          </span>
        </div>
      </div>
      <div
        className="relative w-full px-2 bg-zinc-950/50"
        style={{ height: "360px" }}
      >
        {!hasData ? (
          <div
            className="flex items-center justify-center text-xs text-white/40"
            style={{ height: "360px" }}
          >
            {isLoading
              ? "Loading degradation data..."
              : "No race pace data available"}
          </div>
        ) : (
          <ChartContainer height={360}>
            <ScatterChart
              data={scatterData}
              margin={{ top: 15, right: 20, left: 10, bottom: 10 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="lap"
                type="number"
                name="Lap"
                stroke="#9ca3af"
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                fontSize={11}
                tick={{ fill: "#9ca3af" }}
                domain={lapDomain}
                label={{
                  value: "Lap Number",
                  position: "insideBottomRight",
                  offset: -5,
                  fill: "#6b7280",
                  fontSize: 10,
                }}
              />
              <YAxis
                dataKey="lapTime"
                type="number"
                name="Lap Time"
                stroke="#9ca3af"
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                fontSize={11}
                tick={{ fill: "#9ca3af" }}
                tickFormatter={(v: number) => formatTime(v)}
                domain={lapTimeDomain}
              />
              <ZAxis range={[30, 30]} />
              <Tooltip
                cursor={{
                  strokeDasharray: "3 3",
                  stroke: "rgba(255,255,255,0.2)",
                }}
                content={renderTooltip}
                wrapperStyle={{ outline: "none" }}
              />
              {Array.from(seriesGroups.entries()).map(([key, points]) => {
                const first = points[0];
                return (
                  <Scatter
                    key={key}
                    data={points}
                    fill={getTyreColor(first.compound)}
                    fillOpacity={0.8}
                    strokeWidth={1}
                    stroke={first.color}
                    name={`${first.driverAcronym} · ${first.compound}`}
                  />
                );
              })}
              <Legend
                wrapperStyle={{
                  paddingTop: 8,
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 10,
                }}
                iconSize={8}
              />
            </ScatterChart>
          </ChartContainer>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-[10px] text-white/40">
        <span>Outlier laps filtered (pit in/out, SC, formation)</span>
        <span>Data source: FastF1</span>
      </div>
    </div>
  );
}
