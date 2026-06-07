"use client";

import { getDriverColor } from "@/lib/colors";
import type { Driver, PositionData, SessionResultData } from "@/lib/openf1";
import { useMemo } from "react";

interface BiggestMoversCardProps {
  positions: PositionData[];
  results: SessionResultData[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface Mover {
  driver: Driver;
  start: number;
  end: number;
  delta: number;
}

export function BiggestMoversCard({
  positions,
  results,
  drivers,
  isLoading,
}: BiggestMoversCardProps) {
  const { gainers, losers } = useMemo(() => {
    const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));

    // Starting grid: lap 1 position
    const startByDriver = new Map<number, number>();
    positions.forEach((p) => {
      if (p.lap_number === 1 && p.position != null) {
        startByDriver.set(p.driver_number, p.position);
      }
    });

    // Final position: from results (skip DNF/DSQ — they don't have a meaningful end pos)
    const movers: Mover[] = [];
    results.forEach((r) => {
      if (r.dnf || r.dsq || r.dns) return;
      const driver = driverMap.get(r.driver_number);
      const start = startByDriver.get(r.driver_number);
      if (!driver || start == null || r.position == null) return;
      movers.push({
        driver,
        start,
        end: r.position,
        delta: start - r.position, // positive = gained positions
      });
    });

    const sorted = [...movers].sort((a, b) => b.delta - a.delta);
    return {
      gainers: sorted.slice(0, 5),
      losers: sorted.reverse().slice(0, 5),
    };
  }, [positions, results, drivers]);

  const hasAny = gainers.length > 0 || losers.length > 0;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#111114] p-5">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
            Position Swings
          </p>
          <h2 className="text-lg font-semibold text-white">
            Biggest movers
          </h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/55">
          Grid → finish
        </span>
      </header>
      {!hasAny && !isLoading ? (
        <div className="rounded-lg bg-white/[0.015] px-3 py-6 text-center text-xs text-white/40">
          Position data not available yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-emerald-300/70">
              Top gainers
            </p>
            <ul className="flex flex-col gap-1">
              {gainers.map((m) => (
                <li
                  key={`g-${m.driver.driver_number}`}
                  className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: getDriverColor(m.driver) }}
                    />
                    <span className="font-semibold text-white/85">
                      {m.driver.name_acronym}
                    </span>
                    <span className="font-mono text-[10px] text-white/40">
                      P{m.start} → P{m.end}
                    </span>
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      m.delta > 0 ? "text-emerald-300" : "text-white/40"
                    }`}
                  >
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-rose-300/70">
              Biggest drops
            </p>
            <ul className="flex flex-col gap-1">
              {losers.map((m) => (
                <li
                  key={`l-${m.driver.driver_number}`}
                  className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: getDriverColor(m.driver) }}
                    />
                    <span className="font-semibold text-white/85">
                      {m.driver.name_acronym}
                    </span>
                    <span className="font-mono text-[10px] text-white/40">
                      P{m.start} → P{m.end}
                    </span>
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      m.delta < 0 ? "text-rose-300" : "text-white/40"
                    }`}
                  >
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
