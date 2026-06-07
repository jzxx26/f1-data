"use client";

import { getDriverColor } from "@/lib/colors";
import type { Driver, LapData } from "@/lib/openf1";
import { useMemo } from "react";

interface ConsistencyCardProps {
  laps: LapData[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface Row {
  driver: Driver;
  stdev: number;
  median: number;
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

export function ConsistencyCard({
  laps,
  drivers,
  isLoading,
}: ConsistencyCardProps) {
  const rows = useMemo<Row[]>(() => {
    const byDriver = new Map<number, number[]>();
    laps.forEach((lap) => {
      if (!lap.lap_duration || lap.is_pit_out_lap) return;
      const list = byDriver.get(lap.driver_number) ?? [];
      list.push(lap.lap_duration);
      byDriver.set(lap.driver_number, list);
    });

    const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
    const out: Row[] = [];

    byDriver.forEach((times, driverNumber) => {
      const driver = driverMap.get(driverNumber);
      if (!driver) return;
      const finite = times.filter(Number.isFinite);
      if (finite.length < 5) return;
      const med = median(finite);
      const cleaned = finite.filter((t) => t <= med * 1.07);
      if (cleaned.length < 5) return;
      const mean =
        cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length;
      const variance =
        cleaned.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        cleaned.length;
      const stdev = Math.sqrt(variance);
      if (!Number.isFinite(stdev)) return;
      out.push({ driver, stdev, median: median(cleaned), count: cleaned.length });
    });

    return out.sort((a, b) => a.stdev - b.stdev);
  }, [laps, drivers]);

  const tightest = rows[0]?.stdev ?? 0;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#111114] p-5">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
            Driver Consistency
          </p>
          <h2 className="text-lg font-semibold text-white">
            Tightest stints first
          </h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/55">
          {isLoading ? "Loading…" : `${rows.length} drivers`}
        </span>
      </header>
      <ul className="flex flex-col gap-1">
        {rows.slice(0, 12).map((row, idx) => {
          const delta = row.stdev - tightest;
          const isLeader = idx === 0;
          return (
            <li
              key={row.driver.driver_number}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                isLeader
                  ? "border-emerald-300/20 bg-emerald-400/[0.06]"
                  : "border-white/[0.05] bg-white/[0.015]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-5 font-mono text-white/35">{idx + 1}</span>
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: getDriverColor(row.driver) }}
                />
                <span className="font-semibold text-white/85">
                  {row.driver.name_acronym}
                </span>
                <span className="text-[10px] text-white/35">
                  {row.count} laps
                </span>
              </div>
              <div className="flex items-center gap-3 tabular-nums">
                <span
                  className={`font-mono ${
                    isLeader ? "font-bold text-emerald-100" : "text-white/85"
                  }`}
                >
                  ±{row.stdev.toFixed(3)}s
                </span>
                {!isLeader && (
                  <span className="w-14 text-right text-rose-300/70">
                    +{delta.toFixed(3)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && !isLoading && (
          <li className="rounded-lg bg-white/[0.015] px-3 py-6 text-center text-xs text-white/40">
            Not enough clean laps to score consistency.
          </li>
        )}
      </ul>
    </section>
  );
}
