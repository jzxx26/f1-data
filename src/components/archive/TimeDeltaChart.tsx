"use client";

import { ChartContainer } from "@/components/common/ChartContainer";
import { getDriverColor } from "@/lib/colors";
import type { Driver, LapData } from "@/lib/openf1";
import { formatTime, isFiniteNumber } from "@/lib/utils";
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

interface TimeDeltaChartProps {
  laps: LapData[];
  drivers: Driver[];
  referenceDriver?: number;
  isLoading?: boolean;
}

interface DeltaRow {
  lap: number;
  delta?: number;
  refTime?: number;
  cmpTime?: number;
}

export function TimeDeltaChart({ laps, drivers, referenceDriver, isLoading }: TimeDeltaChartProps) {
  const refDriver = referenceDriver ?? drivers[0]?.driver_number;
  const cmpDriver = drivers.find((d) => d.driver_number !== refDriver)?.driver_number;
  const refInfo = drivers.find((d) => d.driver_number === refDriver);
  const cmpInfo = drivers.find((d) => d.driver_number === cmpDriver);
  const cmpColor = cmpInfo ? getDriverColor(cmpInfo) : "#60a5fa";

  const chartData = useMemo(() => {
    if (!refDriver || !cmpDriver || laps.length === 0) return [];
    const refLaps = new Map<number, number>();
    const cmpLaps = new Map<number, number>();
    laps.forEach((lap) => {
      const lapDuration = lap.lap_duration;
      if (isFiniteNumber(lapDuration) && lapDuration > 0 && lapDuration < 200) {
        if (lap.driver_number === refDriver) refLaps.set(lap.lap_number, lapDuration);
        else if (lap.driver_number === cmpDriver) cmpLaps.set(lap.lap_number, lapDuration);
      }
    });
    const allNums = new Set([...refLaps.keys(), ...cmpLaps.keys()]);
    const sorted = Array.from(allNums).sort((a, b) => a - b);
    let cum = 0;
    const rows: DeltaRow[] = [];
    sorted.forEach((n) => {
      const r = refLaps.get(n), c = cmpLaps.get(n);
      if (r !== undefined && c !== undefined) {
        cum += c - r;
        rows.push({ lap: n, delta: Number(cum.toFixed(3)), refTime: r, cmpTime: c });
      }
    });
    return rows;
  }, [laps, refDriver, cmpDriver]);

  const hasData = chartData.length > 0;
  const maxAbs = useMemo(() => {
    if (!hasData) return 5;
    const values = chartData
      .map((d) => Math.abs(d.delta ?? 0))
      .filter(isFiniteNumber);
    if (values.length === 0) return 5;
    return Math.max(1, Math.ceil(Math.max(...values) + 1));
  }, [chartData, hasData]);

  const renderTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as DeltaRow | undefined;
    if (!row) return null;
    const delta = row.delta ?? 0;
    const sign = delta > 0 ? "+" : "";
    return (
      <div className="min-w-[220px] rounded-xl border border-white/10 bg-black/90 p-3 text-xs text-white/80 shadow-xl backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-white/50">
          <span>Lap {label}</span>
          <span className={`font-bold ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-white/60"}`}>
            {sign}{delta.toFixed(3)}s
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: refInfo ? getDriverColor(refInfo) : "#9ca3af" }} />
              {refInfo?.name_acronym ?? "REF"}
            </span>
            <span className="font-mono text-white/70">{formatTime(row.refTime)}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cmpColor }} />
              {cmpInfo?.name_acronym ?? "CMP"}
            </span>
            <span className="font-mono text-white/70">{formatTime(row.cmpTime)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/5 bg-zinc-900/60 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex flex-col gap-1 border-b border-white/5 bg-zinc-900/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Gap Analysis</p>
          <h2 className="text-lg font-semibold text-white">Cumulative Time Delta</h2>
        </div>
        <div className="flex items-center gap-3">
          {refInfo && cmpInfo && (
            <div className="flex items-center gap-2 rounded-xl bg-black/40 px-3 py-1.5 border border-white/10">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getDriverColor(refInfo) }} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">{refInfo.name_acronym}</span>
              <span className="text-[10px] text-white/30">vs</span>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cmpColor }} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">{cmpInfo.name_acronym}</span>
            </div>
          )}
          <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
            {isLoading ? "Loading…" : "Seconds"}
          </span>
        </div>
      </div>
      <div className="relative w-full px-2 bg-zinc-950/50" style={{ height: "320px" }}>
        {!hasData ? (
          <div className="flex items-center justify-center text-xs text-white/40" style={{ height: "320px" }}>
            {isLoading ? "Loading time delta data..." : drivers.length < 2 ? "Select two drivers to compare" : "No lap time data available"}
          </div>
        ) : (
          <ChartContainer height={320}>
              <ComposedChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="lap" stroke="#9ca3af" tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} fontSize={11} tick={{ fill: "#9ca3af" }} />
                <YAxis stroke="#9ca3af" tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} fontSize={11} domain={[-maxAbs, maxAbs]} tick={{ fill: "#9ca3af" }} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}s`} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} strokeDasharray="6 4" label={{ value: refInfo?.name_acronym ?? "REF", position: "insideTopRight", fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                <Tooltip cursor={{ stroke: "rgba(148,163,184,0.3)", strokeWidth: 1 }} content={renderTooltip} wrapperStyle={{ outline: "none" }} />
                <Line type="monotone" dataKey="delta" stroke={cmpColor} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: cmpColor, stroke: "#000", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
                <Legend formatter={() => `${cmpInfo?.name_acronym ?? "CMP"} gap to ${refInfo?.name_acronym ?? "REF"}`} iconType="plainline" iconSize={16} wrapperStyle={{ paddingTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 11 }} />
              </ComposedChart>
          </ChartContainer>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-[10px] text-white/40">
        <span>{hasData ? `Positive = ${refInfo?.name_acronym ?? "REF"} ahead · Negative = ${cmpInfo?.name_acronym ?? "CMP"} ahead` : "Cumulative lap-time difference"}</span>
        <span>Data source: FastF1</span>
      </div>
    </div>
  );
}
