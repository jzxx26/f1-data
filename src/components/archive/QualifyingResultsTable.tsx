"use client";

import { getDriverColor } from "@/lib/colors";
import type { Driver, SessionResultData } from "@/lib/openf1";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface QualifyingResultsTableProps {
  results: SessionResultData[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface Row {
  position: number;
  driver: Driver | undefined;
  driverNumber: number;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  best: number | null;
  gapToPole: number | null;
  knockedOutIn: "Q1" | "Q2" | "Q3" | undefined;
}

function pickBest(...times: (number | null | undefined)[]) {
  const finite = times.filter(
    (t): t is number => typeof t === "number" && Number.isFinite(t)
  );
  if (finite.length === 0) return null;
  return Math.min(...finite);
}

export function QualifyingResultsTable({
  results,
  drivers,
  isLoading,
}: QualifyingResultsTableProps) {
  const rows = useMemo<Row[]>(() => {
    const sorted = [...results].sort(
      (a, b) => (a.position ?? 99) - (b.position ?? 99)
    );
    const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
    const pole = sorted.find((r) => r.position === 1);
    const poleBest = pole
      ? pickBest(pole.q3_time, pole.q2_time, pole.q1_time)
      : null;

    return sorted.map((r) => {
      const driver = driverMap.get(r.driver_number);
      const best = pickBest(r.q3_time, r.q2_time, r.q1_time);
      const knockedOutIn = r.q3_time
        ? undefined
        : r.q2_time
        ? "Q3"
        : r.q1_time
        ? "Q2"
        : "Q1";
      return {
        position: r.position,
        driver,
        driverNumber: r.driver_number,
        q1: r.q1_time ?? null,
        q2: r.q2_time ?? null,
        q3: r.q3_time ?? null,
        best,
        gapToPole:
          best != null && poleBest != null && r.position !== 1
            ? best - poleBest
            : null,
        knockedOutIn: knockedOutIn as Row["knockedOutIn"],
      };
    });
  }, [results, drivers]);

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#111114] p-5">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
            Qualifying Results
          </p>
          <h2 className="text-lg font-semibold text-white">
            Final grid order
          </h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/55">
          {isLoading ? "Loading…" : `${rows.length} drivers`}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-2 text-left">Pos</th>
              <th className="px-3 py-2 text-left">Driver</th>
              <th className="px-3 py-2 text-right font-mono">Q1</th>
              <th className="px-3 py-2 text-right font-mono">Q2</th>
              <th className="px-3 py-2 text-right font-mono">Q3</th>
              <th className="px-3 py-2 text-right">Best</th>
              <th className="px-3 py-2 text-right">Gap</th>
            </tr>
          </thead>
          <tbody className="text-white/80">
            {rows.map((row) => {
              const color = row.driver ? getDriverColor(row.driver) : "#6b7280";
              const isPole = row.position === 1;
              return (
                <tr
                  key={row.driverNumber}
                  className={cn(
                    "border-b border-white/[0.03] transition hover:bg-white/[0.02]",
                    isPole && "bg-amber-400/[0.05]"
                  )}
                >
                  <td className="px-3 py-2.5 text-left font-mono text-white/85">
                    {row.position}
                  </td>
                  <td className="px-3 py-2.5 text-left">
                    <span className="inline-flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-semibold text-white">
                        {row.driver?.name_acronym ?? row.driverNumber}
                      </span>
                      <span className="text-xs text-white/45">
                        {row.driver?.team_name ?? ""}
                      </span>
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right font-mono tabular-nums",
                      row.knockedOutIn === "Q1"
                        ? "text-rose-300/80"
                        : "text-white/70"
                    )}
                  >
                    {row.q1 != null ? formatTime(row.q1) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right font-mono tabular-nums",
                      row.knockedOutIn === "Q2"
                        ? "text-rose-300/80"
                        : row.q2 == null
                        ? "text-white/25"
                        : "text-white/70"
                    )}
                  >
                    {row.q2 != null ? formatTime(row.q2) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right font-mono tabular-nums",
                      row.q3 == null
                        ? "text-white/25"
                        : isPole
                        ? "font-bold text-amber-100"
                        : "text-white/80"
                    )}
                  >
                    {row.q3 != null ? formatTime(row.q3) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-white">
                    {row.best != null ? formatTime(row.best) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {isPole ? (
                      <span className="text-amber-100">Pole</span>
                    ) : row.gapToPole != null ? (
                      <span className="text-rose-300/80">
                        +{row.gapToPole.toFixed(3)}s
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !isLoading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-xs text-white/40"
                >
                  Qualifying results not yet available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
