"use client";

import { ChartContainer } from "@/components/common/ChartContainer";
import { getDriverColor } from "@/lib/colors";
import type { Driver, PositionData } from "@/lib/openf1";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

interface PositionChartProps {
  positions: PositionData[];
  drivers: Driver[];
  highlight?: number[];
  isLoading?: boolean;
}

interface Row {
  lap: number;
  [driverNumber: string]: number | undefined;
}

export function PositionChart({
  positions,
  drivers,
  highlight,
  isLoading,
}: PositionChartProps) {
  const driverMap = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers]
  );

  const data = useMemo<Row[]>(() => {
    const byLap = new Map<number, Row>();
    positions.forEach((p) => {
      if (!p.lap_number || p.position == null) return;
      const pos = Number(p.position);
      if (!Number.isFinite(pos)) return;
      let row = byLap.get(p.lap_number);
      if (!row) {
        row = { lap: p.lap_number };
        byLap.set(p.lap_number, row);
      }
      row[String(p.driver_number)] = pos;
    });
    return Array.from(byLap.values()).sort((a, b) => a.lap - b.lap);
  }, [positions]);

  const driversToPlot = useMemo(() => {
    if (highlight && highlight.length > 0) {
      return drivers.filter((d) => highlight.includes(d.driver_number));
    }
    return drivers;
  }, [drivers, highlight]);

  const driverCount = driversToPlot.length;

  const renderTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0) return null;
    const sorted = [...payload].sort(
      (a, b) => Number(a.value ?? 99) - Number(b.value ?? 99)
    );
    return (
      <div className="min-w-[200px] rounded-xl border border-white/10 bg-black/85 p-3 text-xs text-white/85 shadow-xl">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-white/45">
          <span>Lap</span>
          <span className="text-white/70">{label}</span>
        </div>
        <div className="flex flex-col gap-1">
          {sorted.map((item) => {
            const driver = driverMap.get(Number(item?.dataKey));
            if (!driver) return null;
            return (
              <div
                key={driver.driver_number}
                className="flex items-center justify-between gap-3"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: getDriverColor(driver) }}
                  />
                  <span className="font-semibold text-white/85">
                    {driver.name_acronym}
                  </span>
                </span>
                <span className="font-mono text-white/70">P{item.value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Race Story
          </p>
          <h2 className="text-lg font-semibold text-white">
            Position changes per lap
          </h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isLoading ? "Loading…" : `${driverCount} drivers`}
        </span>
      </header>
      {data.length === 0 && !isLoading ? (
        <div className="flex h-[320px] items-center justify-center text-xs text-white/40">
          No position data available.
        </div>
      ) : (
        <ChartContainer height={340}>
          <LineChart
            data={data}
            margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
            <XAxis
              dataKey="lap"
              stroke="#9ca3af"
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              fontSize={11}
              tick={{ fill: "#9ca3af" }}
              label={{
                value: "Lap",
                position: "insideBottom",
                offset: -2,
                fill: "#9ca3af",
                fontSize: 11,
              }}
            />
            <YAxis
              reversed
              domain={[1, "dataMax"]}
              stroke="#9ca3af"
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              fontSize={11}
              tick={{ fill: "#9ca3af" }}
              allowDecimals={false}
              label={{
                value: "Position",
                angle: -90,
                position: "insideLeft",
                fill: "#9ca3af",
                fontSize: 11,
              }}
            />
            <Tooltip content={renderTooltip} cursor={{ stroke: "rgba(148,163,184,0.4)" }} />
            {driversToPlot.map((driver) => (
              <Line
                key={driver.driver_number}
                type="stepAfter"
                dataKey={String(driver.driver_number)}
                stroke={getDriverColor(driver)}
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      )}
    </section>
  );
}
