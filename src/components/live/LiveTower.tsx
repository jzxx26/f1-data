"use client";

import { getTyreColor } from "@/lib/colors";
import { teamColour, type LiveDriver, type StandingRow, type Tyre } from "@/lib/live";
import { cn } from "@/lib/utils";

interface LiveTowerProps {
  standings: StandingRow[];
  drivers: LiveDriver[];
  tyres: Record<string, Tyre>;
  selected: string | null;
  compare: string[];
  onSelect: (code: string) => void;
}

const STATUS_LABEL: Record<string, string> = { "IN PIT": "PIT", OUT: "OUT", KO: "KO" };

export function LiveTower({ standings, drivers, tyres, selected, compare, onSelect }: LiveTowerProps) {
  return (
    <section className="flex flex-col rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Timing</p>
          <h2 className="text-lg font-semibold text-white">Live order</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          Click a driver to focus
        </span>
      </header>
      {standings.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/50">No timing yet.</p>
      ) : (
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0d0d10] text-[10px] uppercase tracking-[0.25em] text-white/45">
              <tr>
                <th className="px-2 py-2 text-left">Pos</th>
                <th className="px-2 py-2 text-left">Driver</th>
                <th className="px-2 py-2 text-right">Gap</th>
                <th className="px-2 py-2 text-right">Int</th>
                <th className="px-2 py-2 text-right">Last</th>
                <th className="px-2 py-2 text-left">Tyre</th>
                <th className="px-2 py-2 text-right">Pits</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => {
                const tyre = tyres[row.Driver];
                const status = STATUS_LABEL[row.Status];
                const isSelected = row.Driver === selected;
                return (
                  <tr
                    key={row.Driver}
                    onClick={() => onSelect(row.Driver)}
                    className={cn(
                      "cursor-pointer border-t border-white/5 transition-colors hover:bg-white/[0.04]",
                      isSelected && "bg-red-500/[0.1]",
                      row.Status === "OUT" && "text-white/35"
                    )}
                  >
                    <td className="px-2 py-1.5 tabular-nums font-semibold text-white/85">{row.Position}</td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-2 font-semibold text-white">
                        <span
                          aria-hidden
                          className="h-3 w-1 rounded-full"
                          style={{ backgroundColor: teamColour(drivers, row.Driver) }}
                        />
                        {row.Driver}
                        {compare.includes(row.Driver) && !isSelected ? (
                          <span className="text-[10px] text-white/40">vs</span>
                        ) : null}
                        {status ? (
                          <span className="rounded-full bg-white/10 px-2 text-[10px] text-white/70">{status}</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-white/70">{row.Gap}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-white/55">{row.Interval}</td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        row.LastFlag === "sb"
                          ? "font-semibold text-fuchsia-300"
                          : row.LastFlag === "pb"
                            ? "text-emerald-300"
                            : "text-white/70"
                      )}
                    >
                      {row.LastLap}
                    </td>
                    <td className="px-2 py-1.5">
                      {tyre?.compound && tyre.compound !== "UNKNOWN" ? (
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold"
                            style={{ borderColor: getTyreColor(tyre.compound), color: getTyreColor(tyre.compound) }}
                            title={`${tyre.compound}${tyre.new === false ? " (used)" : ""}`}
                          >
                            {tyre.compound[0]}
                          </span>
                          <span className="tabular-nums text-xs text-white/55">{tyre.age ?? "–"}</span>
                        </span>
                      ) : (
                        <span className="text-white/30">–</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-white/55">{row.Pits ?? "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
