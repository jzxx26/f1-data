"use client";

import { getDriverColor } from "@/lib/colors";
import type { Driver, LapData, SessionResultData } from "@/lib/openf1";
import { formatTime, formatSeconds, isFiniteNumber } from "@/lib/utils";
import { useMemo } from "react";

interface IdealLapCardProps {
  laps: LapData[];
  results: SessionResultData[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface SectorBest {
  time: number;
  driver: Driver | undefined;
}

const SECTOR_KEYS: {
  key: "duration_sector_1" | "duration_sector_2" | "duration_sector_3";
  label: string;
}[] = [
  { key: "duration_sector_1", label: "Sector 1" },
  { key: "duration_sector_2", label: "Sector 2" },
  { key: "duration_sector_3", label: "Sector 3" },
];

export function IdealLapCard({
  laps,
  results,
  drivers,
  isLoading,
}: IdealLapCardProps) {
  const model = useMemo(() => {
    if (laps.length === 0) return null;
    const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));

    const sectors: SectorBest[] = SECTOR_KEYS.map(({ key }) => {
      let best = Infinity;
      let owner: number | undefined;
      laps.forEach((lap) => {
        const v = lap[key];
        if (isFiniteNumber(v) && v > 0 && v < 60 && v < best) {
          best = v;
          owner = lap.driver_number;
        }
      });
      return { time: best, driver: owner ? driverMap.get(owner) : undefined };
    });

    if (!sectors.every((s) => isFiniteNumber(s.time))) return null;

    const idealLap = sectors.reduce((acc, s) => acc + s.time, 0);

    // Pole lap to compare against.
    const pole = results.find((r) => r.position === 1);
    const poleTime = pole
      ? pole.q3_time ?? pole.q2_time ?? pole.q1_time ?? null
      : null;
    const gapToPole =
      poleTime != null && isFiniteNumber(poleTime) ? poleTime - idealLap : null;

    return { sectors, idealLap, poleTime, gapToPole };
  }, [laps, results, drivers]);

  return (
    <section className="flex flex-col rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Session ideal lap
          </p>
          <h2 className="text-lg font-semibold text-white">Purple sectors</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isLoading ? "Loading…" : "Field best"}
        </span>
      </header>

      {!model ? (
        <p className="rounded-xl bg-white/[0.02] px-3 py-6 text-center text-xs text-white/40">
          No sector data available yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {model.sectors.map((s, i) => {
              const color = s.driver ? getDriverColor(s.driver) : "#a855f7";
              return (
                <div
                  key={SECTOR_KEYS[i].key}
                  className="rounded-xl border border-purple-400/20 bg-purple-500/[0.06] px-3 py-2.5"
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-purple-200/60">
                    {SECTOR_KEYS[i].label}
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-purple-100">
                    {formatSeconds(s.time)}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-white/60">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {s.driver?.name_acronym ?? "—"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-end justify-between rounded-xl border border-white/[0.05] bg-black/40 px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                Ideal lap
              </p>
              <p className="mt-0.5 font-mono text-2xl font-bold text-white">
                {formatTime(model.idealLap)}
              </p>
            </div>
            {model.gapToPole != null && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                  Pole left on table
                </p>
                <p className="mt-0.5 font-mono text-lg font-semibold text-amber-300">
                  +{model.gapToPole.toFixed(3)}s
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
