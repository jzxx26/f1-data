"use client";

import { getTyreColor } from "@/lib/colors";
import { teamColour, type LiveDriver, type StandingRow, type Tyre } from "@/lib/live";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface LiveTowerProps {
  standings: StandingRow[];
  drivers: LiveDriver[];
  tyres: Record<string, Tyre>;
  selected: string | null;
  compare: string[];
  onSelect: (code: string) => void;
}

const STATUS_LABEL: Record<string, string> = { "IN PIT": "PIT", OUT: "OUT", KO: "KO" };

const HEADER_PX = 20;
const ROW_MAX_PX = 23;
const ROW_MIN_PX = 14;

/** Row height that fits every car in the panel: full size when there is room, denser down to a floor, then it scrolls. */
export function towerRowHeight(panelPx: number, cars: number): number {
  if (panelPx <= 0 || cars <= 0) return ROW_MAX_PX;
  return Math.max(ROW_MIN_PX, Math.min(ROW_MAX_PX, Math.floor((panelPx - HEADER_PX) / cars)));
}

export function TyreBadge({ tyre, small = false }: { tyre: Tyre | undefined; small?: boolean }) {
  if (!tyre?.compound || tyre.compound === "UNKNOWN") return <span className="text-white/30">–</span>;
  const colour = getTyreColor(tyre.compound);
  return (
    <span className="flex items-center gap-1">
      <span
        className={cn("inline-flex items-center justify-center rounded-full font-bold", small ? "h-3 w-3 border text-[7px]" : "h-4 w-4 border-2 text-[9px]")}
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
  const box = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState(0);
  const empty = standings.length === 0;
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setPanel(element.clientHeight));
    observer.observe(element);
    setPanel(element.clientHeight);
    return () => observer.disconnect();
  }, [empty]);

  if (empty) {
    return <p className="py-6 text-center text-xs text-white/50">No timing yet.</p>;
  }
  const rowPx = towerRowHeight(panel, standings.length);
  const dense = rowPx < 20;
  return (
    <div ref={box} className="@container h-full overflow-auto">
      <table className={cn("w-full", dense ? "text-[11px] leading-none [&_td]:py-0" : "text-xs")}>
        <thead className="sticky top-0 z-10 bg-[#0d0d10] text-[9px] uppercase tracking-[0.2em] text-white/45" style={{ height: HEADER_PX }}>
          <tr>
            <th className="px-1.5 py-0 text-left">P</th>
            <th className="px-1.5 py-0 text-left">Driver</th>
            <th className="px-1.5 py-0 text-right">Gap</th>
            <th className="hidden px-1.5 py-1 text-right @[20rem]:table-cell">Int</th>
            <th className="hidden px-1.5 py-1 text-right @[26rem]:table-cell">Last</th>
            <th className="px-1.5 py-0 text-left">Tyre</th>
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
                style={{ height: rowPx }}
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
                  <TyreBadge tyre={tyres[row.Driver]} small={dense} />
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
