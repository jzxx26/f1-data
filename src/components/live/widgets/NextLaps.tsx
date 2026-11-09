"use client";

import type { Chase, Projection } from "@/lib/live";
import { cn } from "@/lib/utils";

/** Under this many seconds a lap, the two cars run the same pace within the model's reach. */
const SAME_PACE_S = 0.05;

export function chaseLine(chase: Chase, focus: string, momRange: number): string {
  const other = chase.chaser === focus ? chase.leader : chase.chaser;
  const role = chase.chaser === focus ? "ahead" : "behind";
  if (chase.gap === null) return `${other} ${role}: no gap right now.`;
  if (chase.per_lap === null) return `${other} ${role} by ${chase.gap.toFixed(1)} s: no pace for one of the cars yet.`;
  const rate = Math.abs(chase.per_lap);
  const closing = chase.per_lap > SAME_PACE_S;
  const opening = chase.per_lap < -SAME_PACE_S;
  const trend = closing ? `closing ${rate.toFixed(2)} s/lap` : opening ? `opening ${rate.toFixed(2)} s/lap` : "same pace";
  const parts = [`${other} ${role} by ${chase.gap.toFixed(1)} s, ${trend}`];
  if (chase.mom_lap !== null) {
    parts.push(
      chase.gap <= momRange
        ? `already within ${momRange} s`
        : `within ${momRange} s on lap ${chase.mom_lap}`
    );
  }
  if (chase.level_lap !== null) parts.push(`level on lap ${chase.level_lap}`);
  return parts.join(" · ");
}

function GapRow({ chase, focus, momRange }: { chase: Chase; focus: string; momRange: number }) {
  const focusChasing = chase.chaser === focus;
  // good for the focused car: gaining on the car ahead, or pulling away from the one behind
  const good = chase.per_lap !== null && (focusChasing ? chase.per_lap > SAME_PACE_S : chase.per_lap < -SAME_PACE_S);
  const bad = chase.per_lap !== null && (focusChasing ? chase.per_lap < -SAME_PACE_S : chase.per_lap > SAME_PACE_S);
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
      <p className={cn("text-[11px]", good ? "text-emerald-300" : bad ? "text-amber-200" : "text-white/75")}>
        {chaseLine(chase, focus, momRange)}
      </p>
      {chase.projected.length ? (
        <div className="flex gap-1 text-[10px] tabular-nums text-white/55">
          {chase.projected.map((p) => (
            <span
              key={p.lap}
              className={cn("rounded px-1.5 py-0.5", p.gap <= momRange ? "bg-red-500/15 text-red-200" : "bg-white/[0.04]")}
            >
              L{p.lap} {p.gap.toFixed(1)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The focused car's next laps: the gaps either side and whether one more stop pays. */
export function NextLaps({ data, focus }: { data: Projection | undefined; focus: string | null }) {
  if (!focus) return <p className="py-4 text-center text-xs text-white/50">Pick a driver to focus.</p>;
  if (!data) return <p className="py-4 text-center text-xs text-white/50">Projecting…</p>;
  if (data.model_status !== "ok") {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-xs text-white/50">
        {data.reason ?? "The pace model needs more clean laps."} Projections start once it has them.
      </p>
    );
  }
  const window = data.pit_window;
  const best = window?.options[0];
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-auto">
      {data.ahead ? <GapRow chase={data.ahead} focus={focus} momRange={data.mom_range_s} /> : <p className="text-[11px] text-white/50">{focus} leads.</p>}
      {data.behind ? <GapRow chase={data.behind} focus={focus} momRange={data.mom_range_s} /> : null}
      <div className="rounded-xl border border-sky-300/15 bg-sky-400/[0.05] px-2.5 py-1.5 text-[11px] text-sky-100/85">
        <span className="font-semibold uppercase tracking-[0.2em] text-sky-200/80">One more stop · </span>
        {!window || window.reason
          ? window?.reason ?? "No pit window yet."
          : !best
            ? "No compound to compare yet."
            : window.stay_out_wins
              ? `Stay out: the best stop (${best.compound[0]}, lap ${best.best_lap}) still costs ${(-best.gain_vs_stay).toFixed(1)} s by the flag.`
              : `Pit at the end of lap ${best.best_lap} for ${best.compound}: ${best.gain_vs_stay.toFixed(1)} s quicker by the flag than staying out.`}
        {window?.laps_left != null ? (
          <span className="text-sky-100/50"> {window.laps_left} laps left, {window.net_loss.toFixed(1)} s net loss.</span>
        ) : null}
      </div>
      <p className="mt-auto text-[10px] leading-snug text-white/35">
        If both cars run the pace the model expects for their tyres and fuel. Straight-line wear, no traffic,
        safety car or pit stops by others; getting within {data.mom_range_s} s is not a pass. Time only: where
        the car rejoins is on the Pit rejoin card.
      </p>
    </div>
  );
}
