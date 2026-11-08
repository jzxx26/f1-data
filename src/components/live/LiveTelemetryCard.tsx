"use client";

import { ChartContainer } from "@/components/common/ChartContainer";
import { teamColour, type LiveDriver, type LiveTelemetry } from "@/lib/live";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

interface LiveTelemetryCardProps {
  data: LiveTelemetry | undefined;
  drivers: LiveDriver[];
  codes: string[];
  tokenSet: boolean;
}

const CHANNELS = [
  { key: "Speed", label: "Speed (km/h)", height: 200, domain: [0, "auto"] as [number, "auto"] },
  { key: "Throttle", label: "Throttle (%)", height: 110, domain: [0, 100] as [number, number] },
  { key: "Brake", label: "Brake", height: 80, domain: [0, 100] as [number, number] },
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
  const series = useMemo(
    () => Object.fromEntries(CHANNELS.map((c) => [c.key, merge(data, codes, c.key)])),
    [data, codes]
  );
  const empty = !data?.has_data || codes.every((code) => !(data.drivers[code]?.length));

  return (
    <section className="flex flex-col rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Telemetry</p>
          <h2 className="text-lg font-semibold text-white">Last 60 seconds</h2>
        </div>
        <div className="flex gap-2">
          {codes.map((code) => (
            <span key={code} className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/70">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: teamColour(drivers, code) }} />
              {code}
            </span>
          ))}
        </div>
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-white/50">
          {tokenSet
            ? "No car data yet. It arrives once a session is running (a replay made without a token has none)."
            : "Car telemetry needs an F1TV subscription token: set F1TV_SUBSCRIPTION_TOKEN in backend/.env."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {CHANNELS.map((channel) => (
            <div key={channel.key}>
              <p className="mb-1 text-[10px] uppercase tracking-[0.25em] text-white/45">{channel.label}</p>
              <ChartContainer height={channel.height}>
                <LineChart data={series[channel.key]} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", 0]}
                    tickFormatter={(t: number) => `${t.toFixed(0)}s`}
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                    hide={channel.key !== "Brake"}
                  />
                  <YAxis domain={channel.domain} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} width={40} />
                  <Tooltip
                    contentStyle={{ background: "#0d0d10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
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
                      strokeWidth={1.5}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
