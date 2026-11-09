"use client";

import { getTyreColor } from "@/lib/colors";
import { teamColour, type LiveDriver, type PaceModel } from "@/lib/live";
import { cn } from "@/lib/utils";

interface RacePaceProps {
  data: PaceModel | undefined;
  drivers: LiveDriver[];
  focus: string | null;
  onFocus: (code: string) => void;
}

function signed(value: number, digits = 3) {
  return `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(value).toFixed(digits)}`;
}

/** Under this, a car's recent laps are within the model's noise: no trend to call. */
const TREND_S = 0.15;

export function trendLabel(recent: number | null): { text: string; tone: "quick" | "slow" | "flat" } | null {
  if (recent === null) return null;
  if (recent <= -TREND_S) return { text: `${signed(recent, 2)} quicker than expected`, tone: "quick" };
  if (recent >= TREND_S) return { text: `${signed(recent, 2)} slower than expected`, tone: "slow" };
  return { text: "as expected", tone: "flat" };
}

/** Underlying race pace from clean laps, with tyre wear per compound and the fuel effect. */
export function RacePace({ data, drivers, focus, onFocus }: RacePaceProps) {
  if (!data) return <p className="py-4 text-center text-xs text-white/50">Fitting the pace model…</p>;
  if (data.status !== "ok") {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-xs text-white/50">
        {data.reason ?? "Not enough clean laps yet."} It builds up as green-flag laps are completed.
      </p>
    );
  }
  const fuel = data.fuel;
  return (
    <div className="flex h-full flex-col gap-1.5" title={data.method}>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {data.compounds.map((c) => (
          <span
            key={c.compound}
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/75"
            title={`${c.laps} clean laps on ${c.compound}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getTyreColor(c.compound) }} />
            {c.compound[0]} wear {signed(c.deg_s_per_lap)} s/lap
            {c.offset_s ? <span className="text-white/40">· {signed(c.offset_s, 2)} s</span> : null}
          </span>
        ))}
        <span className="text-white/45">
          {fuel?.identified && fuel.s_per_lap !== null
            ? `Fuel ${signed(fuel.s_per_lap)} s/lap (measured)`
            : "Fuel not separable yet: wear includes it"}
        </span>
      </div>
      <div className="@container min-h-0 flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-[#0d0d10] text-[9px] uppercase tracking-[0.2em] text-white/45">
            <tr>
              <th className="px-1 py-0.5 text-left">#</th>
              <th className="px-1 py-0.5 text-left">Driver</th>
              <th className="px-1 py-0.5 text-right">Pace</th>
              <th className="px-1 py-0.5 text-left">Last laps</th>
              <th className="hidden px-1 py-0.5 text-left @[22rem]:table-cell">Tyre</th>
              <th className="hidden px-1 py-0.5 text-right @[26rem]:table-cell">Laps</th>
            </tr>
          </thead>
          <tbody>
            {data.drivers.map((d, index) => {
              const trend = trendLabel(d.recent_vs_model);
              return (
                <tr
                  key={d.driver}
                  onClick={() => onFocus(d.driver)}
                  className={cn("cursor-pointer border-t border-white/5 hover:bg-white/[0.04]", d.driver === focus && "bg-red-500/[0.12]")}
                >
                  <td className="px-1 py-[2px] tabular-nums text-white/60">{index + 1}</td>
                  <td className="px-1 py-[2px]">
                    <span className="flex items-center gap-1.5 font-semibold text-white">
                      <span aria-hidden className="h-3 w-1 rounded-full" style={{ backgroundColor: teamColour(drivers, d.driver) }} />
                      {d.driver}
                    </span>
                  </td>
                  <td className="px-1 py-[2px] text-right tabular-nums text-white/80">
                    {d.pace_delta === 0 ? "best" : `+${d.pace_delta.toFixed(3)}`}
                  </td>
                  <td
                    className={cn(
                      "px-1 py-[2px] tabular-nums",
                      trend?.tone === "quick" ? "text-emerald-300" : trend?.tone === "slow" ? "text-amber-200" : "text-white/40"
                    )}
                  >
                    {trend?.text ?? "–"}
                  </td>
                  <td className="hidden px-1 py-[2px] text-white/60 @[22rem]:table-cell">
                    {d.compound ? `${d.compound[0]} ${d.tyre_age ?? "–"}` : "–"}
                  </td>
                  <td className="hidden px-1 py-[2px] text-right tabular-nums text-white/45 @[26rem]:table-cell">{d.clean_laps}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="shrink-0 text-[10px] text-white/35">
        {data.laps_used} of {data.laps_total} laps are clean (green, no stop, over {data.traffic_s} s clear)
        {data.sigma !== null ? ` · laps scatter ±${data.sigma.toFixed(2)} s` : ""}. Pace is free of tyre age, compound and fuel.
      </p>
    </div>
  );
}
