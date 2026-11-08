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

export function TyreBadge({ tyre }: { tyre: Tyre | undefined }) {
  if (!tyre?.compound || tyre.compound === "UNKNOWN") return <span className="text-white/30">–</span>;
  const colour = getTyreColor(tyre.compound);
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border-2 text-[9px] font-bold"
        style={{ borderColor: colour, color: colour }}
        title={`${tyre.compound}${tyre.new === false ? " (used)" : ""}`}
      >
        {tyre.compound[0]}
      </span>
      <span className="tabular-nums text-[11px] text-white/55">{tyre.age ?? "–"}</span>
    </span>
  );
}

/** The timing tower as a widget body; columns drop as the widget narrows. */
export function LiveTower({ standings, drivers, tyres, selected, compare, onSelect }: LiveTowerProps) {
  if (standings.length === 0) {
    return <p className="py-6 text-center text-xs text-white/50">No timing yet.</p>;
  }
  return (
    <div className="@container h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-[#0d0d10] text-[9px] uppercase tracking-[0.2em] text-white/45">
          <tr>
            <th className="px-1.5 py-1 text-left">P</th>
            <th className="px-1.5 py-1 text-left">Driver</th>
            <th className="px-1.5 py-1 text-right">Gap</th>
            <th className="hidden px-1.5 py-1 text-right @[20rem]:table-cell">Int</th>
            <th className="hidden px-1.5 py-1 text-right @[26rem]:table-cell">Last</th>
            <th className="px-1.5 py-1 text-left">Tyre</th>
            <th className="hidden px-1.5 py-1 text-right @[22rem]:table-cell">Pits</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const status = STATUS_LABEL[row.Status];
            const isSelected = row.Driver === selected;
            return (
              <tr
                key={row.Driver}
                onClick={() => onSelect(row.Driver)}
                className={cn(
                  "cursor-pointer border-t border-white/5 hover:bg-white/[0.04]",
                  isSelected && "bg-red-500/[0.12]",
                  row.Status === "OUT" && "text-white/35"
                )}
              >
                <td className="px-1.5 py-[3px] tabular-nums font-semibold text-white/85">{row.Position}</td>
                <td className="px-1.5 py-[3px]">
                  <span className="flex items-center gap-1.5 font-semibold text-white">
                    <span aria-hidden className="h-3 w-1 rounded-full" style={{ backgroundColor: teamColour(drivers, row.Driver) }} />
                    {row.Driver}
                    {compare.includes(row.Driver) && !isSelected ? <span className="text-[9px] text-white/40">vs</span> : null}
                    {status ? <span className="rounded-full bg-white/10 px-1.5 text-[9px] text-white/70">{status}</span> : null}
                  </span>
                </td>
                <td className="px-1.5 py-[3px] text-right tabular-nums text-white/70">{row.Gap}</td>
                <td className="hidden px-1.5 py-[3px] text-right tabular-nums text-white/55 @[20rem]:table-cell">{row.Interval}</td>
                <td
                  className={cn(
                    "hidden px-1.5 py-[3px] text-right tabular-nums @[26rem]:table-cell",
                    row.LastFlag === "sb" ? "font-semibold text-fuchsia-300" : row.LastFlag === "pb" ? "text-emerald-300" : "text-white/70"
                  )}
                >
                  {row.LastLap}
                </td>
                <td className="px-1.5 py-[3px]">
                  <TyreBadge tyre={tyres[row.Driver]} />
                </td>
                <td className="hidden px-1.5 py-[3px] text-right tabular-nums text-white/55 @[22rem]:table-cell">{row.Pits ?? "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
