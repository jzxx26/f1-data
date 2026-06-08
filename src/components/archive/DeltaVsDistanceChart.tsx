"use client";

import { ChartContainer } from "@/components/common/ChartContainer";
import { getDriverColor } from "@/lib/colors";
import type { Driver, LapTelemetry } from "@/lib/openf1";
import { interpolateField } from "@/lib/telemetry";
import { isFiniteNumber } from "@/lib/utils";
import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

interface DeltaVsDistanceChartProps {
  telemetry: LapTelemetry[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface DeltaRow {
  distance: number;
  delta: number;
}

const STEP_METERS = 25;

export function DeltaVsDistanceChart({
  telemetry,
  drivers,
  isLoading,
}: DeltaVsDistanceChartProps) {
  const model = useMemo(() => {
    if (telemetry.length < 2) return null;
    const a = telemetry[0];
    const b = telemetry[1];
    const driverA = drivers.find((d) => d.driver_number === a.driver_number);
    const driverB = drivers.find((d) => d.driver_number === b.driver_number);
    if (!driverA || !driverB || a.points.length < 2 || b.points.length < 2)
      return null;

    const maxDistance = Math.min(
      a.points[a.points.length - 1].distance,
      b.points[b.points.length - 1].distance
    );
    if (!(maxDistance > 0)) return null;

    const grid: number[] = [];
    for (let d = 0; d <= maxDistance; d += STEP_METERS) grid.push(d);
    const timeA = interpolateField(a.points, grid, "time");
    const timeB = interpolateField(b.points, grid, "time");

    const rows: DeltaRow[] = grid.map((distance, i) => ({
      distance: Math.round(distance),
      // Positive delta = B took longer => A is ahead.
      delta: Number((timeB[i] - timeA[i]).toFixed(3)),
    }));

    const maxAbs = Math.max(
      0.5,
      ...rows.map((r) => Math.abs(r.delta)).filter(isFiniteNumber)
    );

    return {
      rows,
      driverA,
      driverB,
      colorA: getDriverColor(driverA),
      colorB: getDriverColor(driverB),
      maxAbs: Math.ceil(maxAbs * 10) / 10,
    };
  }, [telemetry, drivers]);

  const renderTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0 || !model) return null;
    const delta = (payload[0]?.payload as DeltaRow)?.delta ?? 0;
    const ahead = delta >= 0 ? model.driverA : model.driverB;
    return (
      <div className="min-w-[200px] rounded-xl border border-white/10 bg-black/90 p-3 text-xs text-white/80 shadow-xl backdrop-blur-sm">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-white/50">
          {label} m into lap
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-white/60">Gap</span>
          <span className="font-mono font-bold text-white">
            {Math.abs(delta).toFixed(3)}s
          </span>
        </div>
        <div className="mt-1 text-[11px] text-white/55">
          {ahead.name_acronym} ahead
        </div>
      </div>
    );
  };

  const hasData = Boolean(model && model.rows.length > 0);

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/5 bg-zinc-900/60 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex flex-col gap-1 border-b border-white/5 bg-zinc-900/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Lap Delta
          </p>
          <h2 className="text-lg font-semibold text-white">Gap around the lap</h2>
        </div>
        {model && (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-[10px]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: model.colorA }} />
            <span className="font-bold uppercase tracking-wider text-white/60">
              {model.driverA.name_acronym}
            </span>
            <span className="text-white/30">vs</span>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: model.colorB }} />
            <span className="font-bold uppercase tracking-wider text-white/60">
              {model.driverB.name_acronym}
            </span>
          </div>
        )}
      </div>

      <div className="relative w-full bg-zinc-950/50 px-2" style={{ height: 320 }}>
        {!hasData || !model ? (
          <div className="flex items-center justify-center text-xs text-white/40" style={{ height: 320 }}>
            {isLoading
              ? "Loading telemetry…"
              : "Select two drivers to compare fastest laps"}
          </div>
        ) : (
          <ChartContainer height={320}>
            <ComposedChart data={model.rows} margin={{ top: 15, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis
                dataKey="distance"
                stroke="#9ca3af"
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                fontSize={11}
                tick={{ fill: "#9ca3af" }}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}km`}
              />
              <YAxis
                stroke="#9ca3af"
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                fontSize={11}
                domain={[-model.maxAbs, model.maxAbs]}
                tick={{ fill: "#9ca3af" }}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}s`}
              />
              <ReferenceLine
                y={0}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                label={{
                  value: model.driverA.name_acronym,
                  position: "insideTopRight",
                  fill: "rgba(255,255,255,0.4)",
                  fontSize: 10,
                }}
              />
              <Tooltip
                cursor={{ stroke: "rgba(148,163,184,0.3)", strokeWidth: 1 }}
                content={renderTooltip}
                wrapperStyle={{ outline: "none" }}
              />
              <Line
                type="monotone"
                dataKey="delta"
                stroke={model.colorB}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              <Legend
                formatter={() =>
                  `${model.driverB.name_acronym} gap to ${model.driverA.name_acronym}`
                }
                iconType="plainline"
                iconSize={16}
                wrapperStyle={{ paddingTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 11 }}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-[10px] text-white/40">
        <span>
          {model
            ? `Above 0: ${model.driverA.name_acronym} ahead · Below 0: ${model.driverB.name_acronym} ahead`
            : "Cumulative time gap along the fastest lap"}
        </span>
        <span>Data source: FastF1</span>
      </div>
    </div>
  );
}
