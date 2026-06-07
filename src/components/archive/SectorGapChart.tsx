"use client";

import { ChartContainer } from "@/components/common/ChartContainer";
import { getDriverColor } from "@/lib/colors";
import type { Driver, LapData } from "@/lib/openf1";
import { formatTime, formatSeconds } from "@/lib/utils";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

interface SectorGapChartProps {
  laps: LapData[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface BestSectors {
  s1: number;
  s2: number;
  s3: number;
}

interface GapRow {
  driver: string;
  driverNumber: number;
  bestLap: number;
  ultimateLap: number;
  gap: number;
  s1: number;
  s2: number;
  s3: number;
  bestS1: number;
  bestS2: number;
  bestS3: number;
  color: string;
}

export function SectorGapChart({ laps, drivers, isLoading }: SectorGapChartProps) {
  const analysis = useMemo(() => {
    if (laps.length === 0 || drivers.length === 0) return { bars: [] as GapRow[], sessionBest: null as BestSectors | null };

    const driverNums = new Set(drivers.map((d) => d.driver_number));
    // Find session-best sectors across ALL drivers
    let sessionBestS1 = Infinity, sessionBestS2 = Infinity, sessionBestS3 = Infinity;

    // Per-driver analysis
    const perDriver = new Map<number, { bestLap: number; bestS1: number; bestS2: number; bestS3: number }>();

    laps.forEach((lap) => {
      if (!driverNums.has(lap.driver_number)) return;
      const s1 = lap.duration_sector_1, s2 = lap.duration_sector_2, s3 = lap.duration_sector_3;
      const dur = lap.lap_duration;

      if (!perDriver.has(lap.driver_number)) {
        perDriver.set(lap.driver_number, { bestLap: Infinity, bestS1: Infinity, bestS2: Infinity, bestS3: Infinity });
      }
      const pd = perDriver.get(lap.driver_number)!;

      if (dur && dur > 0 && dur < 200) pd.bestLap = Math.min(pd.bestLap, dur);
      if (s1 && s1 > 0 && s1 < 60) { pd.bestS1 = Math.min(pd.bestS1, s1); sessionBestS1 = Math.min(sessionBestS1, s1); }
      if (s2 && s2 > 0 && s2 < 60) { pd.bestS2 = Math.min(pd.bestS2, s2); sessionBestS2 = Math.min(sessionBestS2, s2); }
      if (s3 && s3 > 0 && s3 < 60) { pd.bestS3 = Math.min(pd.bestS3, s3); sessionBestS3 = Math.min(sessionBestS3, s3); }
    });

    const sessionBest: BestSectors | null =
      sessionBestS1 < Infinity ? { s1: sessionBestS1, s2: sessionBestS2, s3: sessionBestS3 } : null;

    const bars: GapRow[] = [];
    drivers.forEach((driver) => {
      const pd = perDriver.get(driver.driver_number);
      if (!pd || pd.bestS1 === Infinity) return;

      const ultimateLap = pd.bestS1 + pd.bestS2 + pd.bestS3;
      const gap = pd.bestLap !== Infinity ? pd.bestLap - ultimateLap : 0;

      bars.push({
        driver: driver.name_acronym,
        driverNumber: driver.driver_number,
        bestLap: pd.bestLap !== Infinity ? pd.bestLap : ultimateLap,
        ultimateLap,
        gap: Number(gap.toFixed(3)),
        s1: pd.bestS1,
        s2: pd.bestS2,
        s3: pd.bestS3,
        bestS1: sessionBest?.s1 ?? pd.bestS1,
        bestS2: sessionBest?.s2 ?? pd.bestS2,
        bestS3: sessionBest?.s3 ?? pd.bestS3,
        color: getDriverColor(driver),
      });
    });

    bars.sort((a, b) => a.ultimateLap - b.ultimateLap);
    return { bars, sessionBest };
  }, [laps, drivers]);

  const hasData = analysis.bars.length > 0;

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as GapRow | undefined;
    if (!row) return null;
    return (
      <div className="min-w-[240px] rounded-xl border border-white/10 bg-black/90 p-3 text-xs text-white/80 shadow-xl backdrop-blur-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
          {row.driver}
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <span className="text-white/50">Best Lap</span>
          <span className="text-right font-mono text-white/80">{formatTime(row.bestLap)}</span>
          <span className="text-white/50">Ultimate Lap</span>
          <span className="text-right font-mono text-emerald-400">{formatTime(row.ultimateLap)}</span>
          <span className="text-white/50">Time left on table</span>
          <span className="text-right font-mono text-amber-400">+{row.gap.toFixed(3)}s</span>
        </div>
        <hr className="my-2 border-white/10" />
        <div className="grid grid-cols-4 gap-1 text-[10px]">
          <span className="text-white/40"></span>
          <span className="text-center text-white/40">S1</span>
          <span className="text-center text-white/40">S2</span>
          <span className="text-center text-white/40">S3</span>
          <span className="text-white/50">Best</span>
          <span className={`text-center font-mono ${row.s1 === row.bestS1 ? "text-purple-400 font-bold" : "text-white/70"}`}>{formatSeconds(row.s1)}</span>
          <span className={`text-center font-mono ${row.s2 === row.bestS2 ? "text-purple-400 font-bold" : "text-white/70"}`}>{formatSeconds(row.s2)}</span>
          <span className={`text-center font-mono ${row.s3 === row.bestS3 ? "text-purple-400 font-bold" : "text-white/70"}`}>{formatSeconds(row.s3)}</span>
        </div>
      </div>
    );
  };

  // Create stacked bar data - only include chart-needed fields
  // Do NOT spread ...row as it adds non-numeric properties that crash recharts
  const stackedData = analysis.bars.map((row) => ({
    driver: row.driver,
    driverNumber: row.driverNumber,
    s1: Number(row.s1.toFixed(3)),
    s2: Number(row.s2.toFixed(3)),
    s3: Number(row.s3.toFixed(3)),
    gap: row.gap,
    bestLap: row.bestLap,
    ultimateLap: row.ultimateLap,
    bestS1: row.bestS1,
    bestS2: row.bestS2,
    bestS3: row.bestS3,
    color: row.color,
  }));

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/5 bg-zinc-900/60 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex flex-col gap-1 border-b border-white/5 bg-zinc-900/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Sector Breakdown</p>
          <h2 className="text-lg font-semibold text-white">Ultimate Lap Analysis</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isLoading ? "Loading…" : `${analysis.bars.length} drivers`}
        </span>
      </div>

      <div className="relative w-full px-2 bg-zinc-950/50" style={{ height: "320px" }}>
        {!hasData ? (
          <div className="flex items-center justify-center text-xs text-white/40" style={{ height: "320px" }}>
            {isLoading ? "Loading sector data..." : "No sector time data available"}
          </div>
        ) : (
          <ChartContainer height={320}>
              <BarChart data={stackedData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="driver" stroke="#9ca3af" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#e5e7eb", fontWeight: 600 }} />
                <YAxis stroke="#9ca3af" tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} fontSize={10} tick={{ fill: "#9ca3af" }} tickFormatter={(v: number) => `${v.toFixed(0)}s`} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={renderTooltip} wrapperStyle={{ outline: "none" }} />
                <Bar dataKey="s1" stackId="sectors" fill="#f43f5e" fillOpacity={0.85} name="Sector 1" minPointSize={() => 0} />
                <Bar dataKey="s2" stackId="sectors" fill="#f59e0b" fillOpacity={0.85} name="Sector 2" minPointSize={() => 0} />
                <Bar dataKey="s3" stackId="sectors" fill="#8b5cf6" fillOpacity={0.85} name="Sector 3" radius={[4, 4, 0, 0]} minPointSize={() => 0} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ paddingTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 11 }} />
              </BarChart>
          </ChartContainer>
        )}
      </div>

      {/* Gap summary table */}
      {hasData && (
        <div className="border-t border-white/5 px-5 py-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
            Time left on the table (Best Lap vs Ultimate Lap)
          </p>
          <div className="flex flex-wrap gap-2">
            {analysis.bars.map((row) => (
              <div key={row.driverNumber} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/5 px-2.5 py-1.5 text-[11px]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="font-semibold text-white">{row.driver}</span>
                <span className="font-mono text-amber-400/80">+{row.gap.toFixed(3)}s</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-[10px] text-white/40">
        <span>Personal best sectors combined into theoretical Ultimate Lap</span>
        <span>Data source: FastF1</span>
      </div>
    </div>
  );
}
