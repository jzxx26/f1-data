"use client";

import { getDriverColor } from "@/lib/colors";
import type { Driver, LapData, SessionResultData } from "@/lib/openf1";
import { formatTime, formatSeconds } from "@/lib/utils";
import { useMemo } from "react";

interface PoleLapCardProps {
  results: SessionResultData[];
  laps: LapData[];
  drivers: Driver[];
  isLoading?: boolean;
}

export function PoleLapCard({
  results,
  laps,
  drivers,
  isLoading,
}: PoleLapCardProps) {
  const pole = useMemo(() => {
    const winner = results.find((r) => r.position === 1);
    if (!winner) return null;

    const driver = drivers.find((d) => d.driver_number === winner.driver_number);
    if (!driver) return null;

    const poleTime = winner.q3_time ?? winner.q2_time ?? winner.q1_time ?? null;

    // Find the actual fastest lap row in /laps that matches the pole time so
    // we can pull sector breakdown.
    const candidates = laps.filter(
      (l) => l.driver_number === winner.driver_number && l.lap_duration
    );
    const sectorMatch = poleTime
      ? candidates.reduce<LapData | null>((closest, lap) => {
          if (!lap.lap_duration) return closest;
          const distance = Math.abs(lap.lap_duration - poleTime);
          if (!closest) return distance < 0.5 ? lap : null;
          const closestDist = Math.abs((closest.lap_duration ?? 0) - poleTime);
          return distance < closestDist ? lap : closest;
        }, null)
      : null;

    const fastestOverall = candidates.reduce<LapData | null>((best, lap) => {
      if (!lap.lap_duration) return best;
      if (!best || (best.lap_duration ?? Infinity) > lap.lap_duration)
        return lap;
      return best;
    }, null);

    const bestLap = sectorMatch ?? fastestOverall;

    return {
      driver,
      poleTime,
      bestLap,
      q1: winner.q1_time ?? null,
      q2: winner.q2_time ?? null,
      q3: winner.q3_time ?? null,
    };
  }, [results, laps, drivers]);

  if (isLoading && !pole) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-[#111114] p-6">
        <div className="text-sm text-white/40">Loading pole lap…</div>
      </section>
    );
  }
  if (!pole) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-[#111114] p-6">
        <div className="text-sm text-white/40">No qualifying result yet.</div>
      </section>
    );
  }

  const color = getDriverColor(pole.driver);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111114] p-6"
      style={{
        backgroundImage: `linear-gradient(135deg, ${color}1f 0%, transparent 55%)`,
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-amber-200/80">
          Pole position
        </p>
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 16px ${color}` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {pole.driver.broadcast_name}
          </h2>
          <p className="mt-1 text-sm text-white/55">
            {pole.driver.team_name}
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold text-white sm:text-4xl">
            {formatTime(pole.poleTime)}
          </div>
          <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-white/40">
            {pole.q3 ? "Q3 lap" : pole.q2 ? "Q2 lap" : "Q1 lap"}
          </p>
        </div>
      </div>

      {pole.bestLap && (
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { label: "Sector 1", value: pole.bestLap.duration_sector_1 },
            { label: "Sector 2", value: pole.bestLap.duration_sector_2 },
            { label: "Sector 3", value: pole.bestLap.duration_sector_3 },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/[0.05] bg-black/30 px-3 py-2"
            >
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                {s.label}
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-white">
                {formatSeconds(s.value)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
        {pole.q1 != null && (
          <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 font-mono text-white/65">
            Q1 {formatTime(pole.q1)}
          </span>
        )}
        {pole.q2 != null && (
          <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 font-mono text-white/65">
            Q2 {formatTime(pole.q2)}
          </span>
        )}
        {pole.q3 != null && (
          <span className="rounded-full border border-amber-300/30 bg-amber-400/[0.06] px-2.5 py-1 font-mono font-bold text-amber-100">
            Q3 {formatTime(pole.q3)}
          </span>
        )}
      </div>
    </section>
  );
}
