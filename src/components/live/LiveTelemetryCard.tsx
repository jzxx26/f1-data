"use client";

import { teamColour, type LiveDriver, type LiveTelemetry } from "@/lib/live";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface LiveTelemetryCardProps {
  data: LiveTelemetry | undefined;
  drivers: LiveDriver[];
  codes: string[];
  tokenSet: boolean;
}

// flex weights: speed gets the most room
const CHANNELS = [
  { key: "Speed", label: "Speed km/h", grow: 3, domain: [0, "auto"] as [number, "auto"] },
  { key: "Throttle", label: "Throttle %", grow: 2, domain: [0, 100] as [number, number] },
  { key: "Brake", label: "Brake", grow: 1, domain: [0, 100] as [number, number] },
] as const;

type Row = Record<string, number | null>;

/** One row per 0.25 s step, a column per driver, so drivers line up on the same time axis. */
function merge(data: LiveTelemetry | undefined, codes: string[], channel: string): Row[] {
  if (!data) return [];
  const rows = new Map<number, Row>();
  for (const code of codes) {
    for (const sample of data.drivers[code] ?? []) {
      const t = Math.round(sample.t * 4) / 4;
      const row = rows.get(t) ?? { t };
      const value = sample[channel as keyof typeof sample];
      row[code] = typeof value === "number" ? (channel === "Brake" && value <= 1 ? value * 100 : value) : null;
      rows.set(t, row);
    }
  }
  return Array.from(rows.values()).sort((a, b) => (a.t as number) - (b.t as number));
}

export function LiveTelemetryCard({ data, drivers, codes, tokenSet }: LiveTelemetryCardProps) {
  const series = useMemo(() => Object.fromEntries(CHANNELS.map((c) => [c.key, merge(data, codes, c.key)])), [data, codes]);
  const empty = !data?.has_data || codes.every((code) => !data.drivers[code]?.length);

  if (empty) {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-xs text-white/50">
        {tokenSet
          ? "No car data yet. It arrives once a session is running (a replay made without a token has none)."
          : "Car telemetry needs an F1TV subscription token: set F1TV_SUBSCRIPTION_TOKEN in backend/.env."}
      </p>
    );
  }
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="flex gap-2 text-[10px] text-white/60">
        {codes.map((code, index) => (
          <span key={code} className="flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-3" style={{ backgroundColor: teamColour(drivers, code), opacity: index ? 0.7 : 1 }} />
            {code}
            {index ? " (dashed)" : ""}
          </span>
        ))}
        <span className="ml-auto text-white/35">last 60 s</span>
      </div>
      {CHANNELS.map((channel) => (
        <div key={channel.key} className="flex min-h-0 flex-col" style={{ flexGrow: channel.grow, flexBasis: 0 }}>
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/40">{channel.label}</p>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series[channel.key]} margin={{ top: 2, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", 0]}
                  tickFormatter={(t: number) => `${t.toFixed(0)}s`}
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }}
                  hide={channel.key !== "Brake"}
                />
                <YAxis domain={channel.domain} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} width={36} />
                <Tooltip
                  contentStyle={{ background: "#0d0d10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }}
                  labelFormatter={(t) => `${Number(t).toFixed(2)} s`}
                />
                {codes.map((code, index) => (
                  <Line
                    key={code}
                    dataKey={code}
                    stroke={teamColour(drivers, code)}
                    strokeDasharray={index > 0 ? "4 3" : undefined}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                    strokeWidth={1.4}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
