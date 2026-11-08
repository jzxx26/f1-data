"use client";

import { useLiveData } from "@/components/live/dashboard/LiveData";
import { getTyreColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

/** Every car's stints in race order, on a shared lap axis. */
export function TyreStints() {
  const { snapshot, focus, setFocus } = useLiveData();
  if (!snapshot || snapshot.stints.length === 0) {
    return <p className="py-4 text-center text-xs text-white/50">No tyre data yet.</p>;
  }
  const lastLap = Math.max(
    snapshot.session.current_lap ?? 0,
    ...snapshot.stints.map((s) => s.LapEnd ?? 0),
    1
  );
  const byDriver = new Map<string, typeof snapshot.stints>();
  for (const stint of snapshot.stints) {
    byDriver.set(stint.Driver, [...(byDriver.get(stint.Driver) ?? []), stint]);
  }
  return (
    <div className="h-full overflow-auto pr-1">
      <div className="flex flex-col gap-[3px]">
        {snapshot.standings.map((row) => {
          const stints = byDriver.get(row.Driver) ?? [];
          return (
            <button
              type="button"
              key={row.Driver}
              onClick={() => setFocus(row.Driver)}
              className={cn("flex items-center gap-2 rounded text-left", row.Driver === focus && "bg-white/[0.06]")}
            >
              <span className="w-9 shrink-0 text-[10px] font-semibold text-white/80">{row.Driver}</span>
              <span className="relative h-3.5 flex-1 rounded bg-white/[0.03]">
                {stints.map((stint) => {
                  const colour = getTyreColor(stint.Compound);
                  const left = ((stint.LapStart - 1) / lastLap) * 100;
                  const width = (Math.max(stint.LapCount, 1) / lastLap) * 100;
                  return (
                    <span
                      key={stint.Stint}
                      title={`${stint.Compound ?? "?"} · laps ${stint.LapStart}–${stint.LapEnd} · ${stint.New === false ? "used" : "new"} set`}
                      className={cn("absolute top-0 h-full rounded-sm border", stint.New === false && "border-dashed")}
                      style={{ left: `${left}%`, width: `${width}%`, backgroundColor: `${colour}33`, borderColor: colour }}
                    />
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-right text-[9px] text-white/35">Lap 1 → {lastLap} · dashed: used set</p>
    </div>
  );
}
