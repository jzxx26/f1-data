"use client";

import { getDriverColor } from "@/lib/colors";
import type { Driver, LapData } from "@/lib/openf1";
import { useMemo } from "react";

interface TopSpeedsCardProps {
  laps: LapData[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface Row {
  driver: Driver;
  topSpeed: number;
  lapNumber: number;
  delta: number;
}

export function TopSpeedsCard({ laps, drivers, isLoading }: TopSpeedsCardProps) {
  const rows = useMemo<Row[]>(() => {
    const bestByDriver = new Map<
      number,
      { speed: number; lapNumber: number }
    >();
    laps.forEach((lap) => {
      const candidate = Math.max(
        lap.st_speed ?? 0,
        lap.i1_speed ?? 0,
        lap.i2_speed ?? 0
      );
      if (!candidate) return;
      const current = bestByDriver.get(lap.driver_number);
      if (!current || current.speed < candidate) {
        bestByDriver.set(lap.driver_number, {
          speed: candidate,
          lapNumber: lap.lap_number,
        });
      }
    });

    const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
    const ranked = Array.from(bestByDriver.entries())
      .map(([num, value]) => ({
        driver: driverMap.get(num),
        topSpeed: value.speed,
        lapNumber: value.lapNumber,
      }))
      .filter((r): r is { driver: Driver; topSpeed: number; lapNumber: number } =>
        Boolean(r.driver)
      )
      .sort((a, b) => b.topSpeed - a.topSpeed);

    const fastest = ranked[0]?.topSpeed ?? 0;
    return ranked.map((r) => ({ ...r, delta: r.topSpeed - fastest }));
  }, [laps, drivers]);

  return (
    <section className="flex flex-col rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Speed Trap
          </p>
          <h2 className="text-lg font-semibold text-white">Top speeds</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isLoading ? "Loading…" : `${rows.length} drivers`}
        </span>
      </header>
      <ul className="flex flex-col gap-1">
        {rows.slice(0, 11).map((row, idx) => {
          const isLeader = idx === 0;
          return (
            <li
              key={row.driver.driver_number}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                isLeader
                  ? "border-sky-300/20 bg-sky-400/[0.06]"
                  : "border-white/[0.04] bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-5 font-mono text-white/40">{idx + 1}</span>
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: getDriverColor(row.driver) }}
                />
                <span className="font-semibold text-white/85">
                  {row.driver.name_acronym}
                </span>
                <span className="text-[10px] text-white/40">L{row.lapNumber}</span>
              </div>
              <div className="flex items-center gap-3 tabular-nums">
                <span
                  className={`font-mono ${
                    isLeader ? "font-bold text-sky-100" : "text-white/85"
                  }`}
                >
                  {row.topSpeed.toFixed(0)} km/h
                </span>
                {!isLeader && (
                  <span className="w-12 text-right text-rose-300/70">
                    {row.delta.toFixed(0)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && !isLoading && (
          <li className="rounded-xl bg-white/[0.02] px-3 py-6 text-center text-xs text-white/40">
            No speed trap data available.
          </li>
        )}
      </ul>
    </section>
  );
}
