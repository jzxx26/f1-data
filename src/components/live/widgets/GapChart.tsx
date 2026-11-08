"use client";

import { useLiveData } from "@/components/live/dashboard/LiveData";
import { teamColour } from "@/lib/live";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Gap of the cars around the focused one, relative to it: above the line is ahead. */
export function GapChart() {
  const { gaps, focus, snapshot } = useLiveData();
  const codes = useMemo(() => Object.keys(gaps?.gaps ?? {}), [gaps]);
  const rows = useMemo(() => {
    if (!gaps || !focus || !gaps.gaps[focus]) return [];
    const mine = gaps.gaps[focus];
    return gaps.t.map((t, i) => {
      const row: Record<string, number | null> = { t: t / 60 };
      for (const code of codes) {
        const theirs = gaps.gaps[code][i];
        // positive: the other car is that many seconds ahead of the focused one
        row[code] = theirs === null || mine[i] === null ? null : (mine[i] as number) - theirs;
      }
      return row;
    });
  }, [gaps, focus, codes]);

  if (!focus || rows.length < 2) {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-xs text-white/50">
        The gap history builds up while a race runs (a sample every 2 s of race time).
      </p>
    );
  }
  const drivers = snapshot?.drivers ?? [];
  // Teammates share a colour: the second car of a team gets a dashed line.
  const seen = new Set<string>();
  const dashed = new Set<string>();
  for (const code of codes) {
    const colour = teamColour(drivers, code);
    if (seen.has(colour)) dashed.add(code);
    seen.add(colour);
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-white/45">
        <span>
          Seconds ahead (+) / behind (−) <b className="text-white/70">{focus}</b> · last {Math.round(-rows[0].t!)} min
        </span>
        {codes.map((code) => (
          <span key={code} className="flex items-center gap-1 text-white/70">
            <svg width="14" height="4" aria-hidden>
              <line x1="0" y1="2" x2="14" y2="2" stroke={teamColour(drivers, code)} strokeWidth="2" strokeDasharray={dashed.has(code) ? "3 2" : undefined} />
            </svg>
            {code}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="t" type="number" domain={["dataMin", 0]} tickFormatter={(m: number) => `${m.toFixed(0)}m`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} width={36} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" />
            <Tooltip
              contentStyle={{ background: "#0d0d10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }}
              labelFormatter={(m) => `${Number(m).toFixed(1)} min ago`}
              formatter={(value: number, name: string) => [`${value > 0 ? "+" : ""}${value.toFixed(3)} s`, name]}
            />
            {codes.map((code) => (
              <Line
                key={code}
                dataKey={code}
                stroke={teamColour(drivers, code)}
                strokeWidth={code === focus ? 2.2 : 1.3}
                strokeDasharray={dashed.has(code) ? "5 3" : undefined}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
