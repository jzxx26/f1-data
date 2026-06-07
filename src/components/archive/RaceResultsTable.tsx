"use client";

import { getDriverColor } from "@/lib/colors";
import type { Driver, SessionResultData } from "@/lib/openf1";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface RaceResultsTableProps {
  results: SessionResultData[];
  drivers: Driver[];
  isLoading?: boolean;
}

interface Row {
  position: number;
  driver: Driver | undefined;
  driverNumber: number;
  laps?: number;
  gapLabel: string;
  points?: number;
  status?: string;
}

function formatGap(gap: SessionResultData["gap_to_leader"], position: number) {
  if (position === 1) return "Leader";
  if (gap === undefined || gap === null) return "--";
  const value = Array.isArray(gap) ? gap.at(-1) : gap;
  if (value === undefined || value === null) return "--";
  if (typeof value === "string") return value;
  return `+${value.toFixed(3)}s`;
}

export function RaceResultsTable({
  results,
  drivers,
  isLoading,
}: RaceResultsTableProps) {
  const rows = useMemo<Row[]>(() => {
    return [...results]
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
      .map((r) => {
        const driver = drivers.find((d) => d.driver_number === r.driver_number);
        return {
          position: r.position,
          driver,
          driverNumber: r.driver_number,
          laps: r.number_of_laps,
          gapLabel: formatGap(r.gap_to_leader, r.position),
          points: r.points,
          status: r.dnf ? "DNF" : r.dsq ? "DSQ" : r.dns ? "DNS" : undefined,
        };
      });
  }, [results, drivers]);

  return (
    <section className="rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Final Standings
          </p>
          <h2 className="text-lg font-semibold text-white">Race results</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isLoading ? "Loading…" : `${rows.length} drivers`}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-[11px] uppercase tracking-[0.2em] text-white/40">
            <tr className="border-b border-white/5">
              <th className="px-3 py-2 text-left">Pos</th>
              <th className="px-3 py-2 text-left">Driver</th>
              <th className="px-3 py-2 text-right">Laps</th>
              <th className="px-3 py-2 text-right">Gap</th>
              <th className="px-3 py-2 text-right">Points</th>
              <th className="px-3 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="text-white/80">
            {rows.map((row) => {
              const color = row.driver
                ? getDriverColor(row.driver)
                : "#6b7280";
              return (
                <tr
                  key={row.driverNumber}
                  className={cn(
                    "border-b border-white/[0.03] transition hover:bg-white/[0.03]",
                    row.position === 1 && "bg-amber-400/[0.04]"
                  )}
                >
                  <td className="px-3 py-2.5 text-left font-mono text-white/90">
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
                      <span className="text-xs text-white/50">
                        {row.driver?.team_name ?? ""}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-white/70 tabular-nums">
                    {row.laps ?? "--"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-white/80">
                    {row.gapLabel}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-200/90">
                    {row.points ?? 0}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {row.status ? (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-200">
                        {row.status}
                      </span>
                    ) : (
                      <span className="text-xs text-white/30">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-xs text-white/40">
                  Results not yet available for this session.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
