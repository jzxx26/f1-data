"use client";

import { getDriverColor } from "@/lib/colors";
import type { Driver, LapData } from "@/lib/openf1";
import { formatTime, formatSeconds } from "@/lib/utils";
import { useMemo } from "react";

interface FastestLapsCardProps {
  laps: LapData[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface Row {
  driver: Driver;
  lap: LapData;
  delta: number;
}

export function FastestLapsCard({ laps, drivers, isLoading }: FastestLapsCardProps) {
  const rows = useMemo<Row[]>(() => {
    const fastestByDriver = new Map<number, LapData>();
    laps.forEach((lap) => {
      if (!lap.lap_duration || lap.is_pit_out_lap) return;
      const best = fastestByDriver.get(lap.driver_number);
      if (!best || (best.lap_duration ?? Infinity) > lap.lap_duration) {
        fastestByDriver.set(lap.driver_number, lap);
      }
    });

    const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
    const ranked = Array.from(fastestByDriver.entries())
      .map(([num, lap]) => ({ num, lap, driver: driverMap.get(num) }))
      .filter((r): r is { num: number; lap: LapData; driver: Driver } =>
        Boolean(r.driver && r.lap.lap_duration)
      )
      .sort((a, b) => (a.lap.lap_duration ?? 0) - (b.lap.lap_duration ?? 0));

    const fastestOverall = ranked[0]?.lap.lap_duration ?? 0;
    return ranked.map((r) => ({
      driver: r.driver,
      lap: r.lap,
      delta: (r.lap.lap_duration ?? 0) - fastestOverall,
    }));
  }, [laps, drivers]);

  const fastest = rows[0];

  return (
    <section className="flex flex-col rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Lap Times
          </p>
          <h2 className="text-lg font-semibold text-white">Fastest laps</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isLoading ? "Loading…" : `${rows.length} drivers`}
        </span>
      </header>
      {fastest ? (
        <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="h-3 w-3 rounded-full ring-2 ring-amber-300/40"
                style={{ backgroundColor: getDriverColor(fastest.driver) }}
              />
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                  Fastest of the race
                </div>
                <div className="text-base font-semibold text-white">
                  {fastest.driver.broadcast_name}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-bold text-amber-100">
                {formatTime(fastest.lap.lap_duration)}
              </div>
              <div className="text-[11px] text-amber-200/60">
                Lap {fastest.lap.lap_number}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-amber-200/70">
            <div className="rounded-lg bg-black/30 px-2 py-1.5 text-center">
              <div className="uppercase tracking-wider opacity-70">S1</div>
              <div className="font-mono text-white/85">
                {formatSeconds(fastest.lap.duration_sector_1)}
              </div>
            </div>
            <div className="rounded-lg bg-black/30 px-2 py-1.5 text-center">
              <div className="uppercase tracking-wider opacity-70">S2</div>
              <div className="font-mono text-white/85">
                {formatSeconds(fastest.lap.duration_sector_2)}
              </div>
            </div>
            <div className="rounded-lg bg-black/30 px-2 py-1.5 text-center">
              <div className="uppercase tracking-wider opacity-70">S3</div>
              <div className="font-mono text-white/85">
                {formatSeconds(fastest.lap.duration_sector_3)}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <ul className="flex flex-col gap-1">
        {rows.slice(1, 11).map((row, idx) => (
          <li
            key={row.driver.driver_number}
            className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-5 font-mono text-white/40">{idx + 2}</span>
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: getDriverColor(row.driver) }}
              />
              <span className="font-semibold text-white/85">
                {row.driver.name_acronym}
              </span>
              <span className="text-[10px] text-white/40">L{row.lap.lap_number}</span>
            </div>
            <div className="flex items-center gap-3 tabular-nums">
              <span className="text-white/85">{formatTime(row.lap.lap_duration)}</span>
              <span className="w-16 text-right text-rose-300/70">
                +{row.delta.toFixed(3)}s
              </span>
            </div>
          </li>
        ))}
        {rows.length === 0 && !isLoading && (
          <li className="rounded-xl bg-white/[0.02] px-3 py-6 text-center text-xs text-white/40">
            No lap data available.
          </li>
        )}
      </ul>
    </section>
  );
}
