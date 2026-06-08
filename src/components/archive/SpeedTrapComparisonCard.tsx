"use client";

import { getDriverColor } from "@/lib/colors";
import type { Driver, LapData } from "@/lib/openf1";
import { useMemo } from "react";

interface SpeedTrapComparisonCardProps {
  laps: LapData[];
  drivers: Driver[];
  isLoading?: boolean;
}

const TRAPS: { key: "i1_speed" | "i2_speed" | "st_speed"; label: string }[] = [
  { key: "i1_speed", label: "Sector 1" },
  { key: "i2_speed", label: "Sector 2" },
  { key: "st_speed", label: "Speed trap" },
];

interface DriverSpeeds {
  driver: Driver;
  color: string;
  speeds: Record<string, number>;
}

export function SpeedTrapComparisonCard({
  laps,
  drivers,
  isLoading,
}: SpeedTrapComparisonCardProps) {
  const rows = useMemo<DriverSpeeds[]>(() => {
    return drivers
      .map((driver) => {
        const driverLaps = laps.filter(
          (l) => l.driver_number === driver.driver_number
        );
        const speeds: Record<string, number> = {};
        TRAPS.forEach(({ key }) => {
          const best = driverLaps.reduce((max, lap) => {
            const v = lap[key];
            return typeof v === "number" && v > max ? v : max;
          }, 0);
          speeds[key] = best;
        });
        return { driver, color: getDriverColor(driver), speeds };
      })
      .filter((r) => TRAPS.some(({ key }) => r.speeds[key] > 0));
  }, [laps, drivers]);

  return (
    <section className="flex flex-col rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Speed traps
          </p>
          <h2 className="text-lg font-semibold text-white">Straight-line pace</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isLoading ? "Loading…" : `${rows.length} drivers`}
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-white/[0.02] px-3 py-6 text-center text-xs text-white/40">
          Select drivers to compare speed-trap numbers.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {TRAPS.map(({ key, label }) => {
            const fastest = Math.max(...rows.map((r) => r.speeds[key] || 0));
            return (
              <div key={key}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  {label}
                </p>
                <div className="flex flex-col gap-1.5">
                  {rows.map((r) => {
                    const speed = r.speeds[key] || 0;
                    const pct = fastest > 0 ? (speed / fastest) * 100 : 0;
                    const isFastest = speed === fastest && speed > 0;
                    return (
                      <div key={r.driver.driver_number} className="flex items-center gap-3">
                        <span className="w-10 text-xs font-semibold text-white/80">
                          {r.driver.name_acronym}
                        </span>
                        <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-white/[0.04]">
                          <div
                            className="h-full rounded-md"
                            style={{
                              width: `${Math.max(pct, 4)}%`,
                              backgroundColor: r.color,
                              opacity: isFastest ? 0.9 : 0.55,
                            }}
                          />
                        </div>
                        <span
                          className={`w-20 text-right font-mono text-xs tabular-nums ${
                            isFastest ? "font-bold text-white" : "text-white/70"
                          }`}
                        >
                          {speed > 0 ? `${speed.toFixed(0)} km/h` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
