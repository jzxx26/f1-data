"use client";

import { ChartContainer } from "@/components/common/ChartContainer";
import { getDriverColor } from "@/lib/colors";
import type { Driver, LapData } from "@/lib/openf1";
import { formatTime } from "@/lib/utils";
import { useMemo } from "react";
import {
  CartesianGrid,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

interface RacePaceChartProps {
  laps: LapData[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface PaceRow {
  acronym: string;
  driverNumber: number;
  color: string;
  median: number;
  mean: number;
  stdev: number;
  best: number;
  worst: number;
  count: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function RacePaceChart({
  laps,
  drivers,
  isLoading,
}: RacePaceChartProps) {
  const data = useMemo<PaceRow[]>(() => {
    // group lap times per driver, drop pit laps + outliers > median * 1.07 (typical safety-car/in-out laps)
    const byDriver = new Map<number, number[]>();
    laps.forEach((lap) => {
      if (!lap.lap_duration || lap.is_pit_out_lap) return;
      const list = byDriver.get(lap.driver_number) ?? [];
      list.push(lap.lap_duration);
      byDriver.set(lap.driver_number, list);
    });

    const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
    const rows: PaceRow[] = [];

    byDriver.forEach((times, driverNumber) => {
      const driver = driverMap.get(driverNumber);
      if (!driver || times.length < 5) return;

      const finite = times.filter((t) => Number.isFinite(t));
      if (finite.length < 5) return;

      const med = median(finite);
      const cleaned = finite.filter((t) => t <= med * 1.07);
      if (cleaned.length < 5) return;

      const cleanedMedian = median(cleaned);
      const mean =
        cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length;
      const variance =
        cleaned.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        cleaned.length;
      const stdev = Math.sqrt(variance);
      const best = Math.min(...cleaned);
      const worst = Math.max(...cleaned);

      if (![cleanedMedian, mean, stdev, best, worst].every(Number.isFinite)) {
        return;
      }

      rows.push({
        acronym: driver.name_acronym,
        driverNumber,
        color: getDriverColor(driver),
        median: cleanedMedian,
        mean,
        stdev,
        best,
        worst,
        count: cleaned.length,
      });
    });

    return rows.sort((a, b) => a.median - b.median);
  }, [laps, drivers]);

  const yAxisDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 1];
    const allValues = data
      .flatMap((row) => [row.best, row.worst, row.median])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (allValues.length === 0) return [0, 1];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    return [min - 0.5, max + 0.5];
  }, [data]);

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as PaceRow | undefined;
    if (!row) return null;
    return (
      <div className="min-w-[200px] rounded-xl border border-white/10 bg-black/85 p-3 text-xs text-white/85 shadow-xl">
        <div className="mb-2 flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: row.color }}
          />
          <span className="font-semibold text-white">{row.acronym}</span>
          <span className="text-white/40">({row.count} laps)</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <span className="text-white/55">Median</span>
          <span className="text-right font-mono text-white/85">
            {formatTime(row.median)}
          </span>
          <span className="text-white/55">Mean</span>
          <span className="text-right font-mono text-white/85">
            {formatTime(row.mean)}
          </span>
          <span className="text-white/55">Std dev</span>
          <span className="text-right font-mono text-white/85">
            ±{row.stdev.toFixed(3)}s
          </span>
          <span className="text-white/55">Best clean</span>
          <span className="text-right font-mono text-white/85">
            {formatTime(row.best)}
          </span>
          <span className="text-white/55">Worst clean</span>
          <span className="text-right font-mono text-white/85">
            {formatTime(row.worst)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Race Pace
          </p>
          <h2 className="text-lg font-semibold text-white">
            Pace distribution (clean laps)
          </h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isLoading ? "Loading…" : `${data.length} drivers`}
        </span>
      </header>
      {data.length === 0 && !isLoading ? (
        <div className="flex h-[280px] items-center justify-center text-xs text-white/40">
          Not enough clean lap data yet.
        </div>
      ) : (
        <ChartContainer height={300}>
          <ScatterChart
            data={data}
            margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
          >
            <CartesianGrid
              stroke="rgba(255,255,255,0.07)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="acronym"
              type="category"
              allowDuplicatedCategory={false}
              stroke="#9ca3af"
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              fontSize={10}
              interval={0}
              tick={{ fill: "#9ca3af" }}
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis
              type="number"
              stroke="#9ca3af"
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              fontSize={11}
              tick={{ fill: "#9ca3af" }}
              domain={yAxisDomain}
              tickFormatter={(v) => formatTime(Number(v))}
              label={{
                value: "Lap time",
                angle: -90,
                position: "insideLeft",
                fill: "#9ca3af",
                fontSize: 11,
              }}
            />
            <Tooltip
              content={renderTooltip}
              cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.2)" }}
            />
            <Scatter
              name="Worst clean lap"
              dataKey="worst"
              fill="#f87171"
              shape="triangle"
            />
            <Scatter
              name="Median"
              dataKey="median"
              fill="#ffffff"
              shape="circle"
            />
            <Scatter
              name="Best clean lap"
              dataKey="best"
              fill="#facc15"
              shape="diamond"
            />
          </ScatterChart>
        </ChartContainer>
      )}
    </section>
  );
}
