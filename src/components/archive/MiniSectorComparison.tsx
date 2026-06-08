"use client";

import { ChartContainer } from "@/components/common/ChartContainer";
import { getDriverColor } from "@/lib/colors";
import type { Driver, LapTelemetry } from "@/lib/openf1";
import { computeMiniSectors } from "@/lib/telemetry";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

interface MiniSectorComparisonProps {
  telemetry: LapTelemetry[];
  drivers: Driver[];
  isLoading?: boolean;
}

const SECTOR_COUNT = 20;

interface BarRow {
  sector: number;
  delta: number;
  winner: "A" | "B";
}

export function MiniSectorComparison({
  telemetry,
  drivers,
  isLoading,
}: MiniSectorComparisonProps) {
  const model = useMemo(() => {
    if (telemetry.length < 2) return null;
    const a = telemetry[0];
    const b = telemetry[1];
    const driverA = drivers.find((d) => d.driver_number === a.driver_number);
    const driverB = drivers.find((d) => d.driver_number === b.driver_number);
    if (!driverA || !driverB) return null;

    const { sectors } = computeMiniSectors(a.points, b.points, SECTOR_COUNT);
    if (sectors.length === 0) return null;

    const colorA = getDriverColor(driverA);
    const colorB = getDriverColor(driverB);
    const rows: BarRow[] = sectors.map((s) => ({
      sector: s.index + 1,
      // Show B's gap to A: negative = B faster, positive = A faster.
      delta: Number((-s.delta).toFixed(3)),
      winner: s.winner,
    }));

    const wonA = sectors.filter((s) => s.winner === "A").length;
    const wonB = sectors.length - wonA;
    const totalGainB = sectors.reduce((acc, s) => acc + Math.max(0, -s.delta), 0);
    const totalGainA = sectors.reduce((acc, s) => acc + Math.max(0, s.delta), 0);

    return {
      rows,
      driverA,
      driverB,
      colorA,
      colorB,
      wonA,
      wonB,
      totalGainA,
      totalGainB,
    };
  }, [telemetry, drivers]);

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0 || !model) return null;
    const row = payload[0]?.payload as BarRow | undefined;
    if (!row) return null;
    const faster = row.winner === "A" ? model.driverA : model.driverB;
    return (
      <div className="min-w-[180px] rounded-xl border border-white/10 bg-black/90 p-3 text-xs text-white/80 shadow-xl backdrop-blur-sm">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-white/50">
          Mini-sector {row.sector}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-white/60">{faster.name_acronym} faster by</span>
          <span className="font-mono font-bold text-white">
            {Math.abs(row.delta).toFixed(3)}s
          </span>
        </div>
      </div>
    );
  };

  const hasData = Boolean(model && model.rows.length > 0);

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/5 bg-zinc-900/60 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex flex-col gap-1 border-b border-white/5 bg-zinc-900/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Mini-sectors
          </p>
          <h2 className="text-lg font-semibold text-white">Where time is won</h2>
        </div>
        {model && (
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: model.colorA }} />
              <span className="font-bold text-white/70">{model.driverA.name_acronym}</span>
              <span className="font-mono text-white/45">{model.wonA}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: model.colorB }} />
              <span className="font-bold text-white/70">{model.driverB.name_acronym}</span>
              <span className="font-mono text-white/45">{model.wonB}</span>
            </span>
          </div>
        )}
      </div>

      <div className="relative w-full bg-zinc-950/50 px-2" style={{ height: 300 }}>
        {!hasData || !model ? (
          <div className="flex items-center justify-center text-xs text-white/40" style={{ height: 300 }}>
            {isLoading
              ? "Loading telemetry…"
              : "Select two drivers to compare fastest laps"}
          </div>
        ) : (
          <ChartContainer height={300}>
            <BarChart data={model.rows} margin={{ top: 15, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis
                dataKey="sector"
                stroke="#9ca3af"
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                fontSize={10}
                tick={{ fill: "#9ca3af" }}
              />
              <YAxis
                stroke="#9ca3af"
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                fontSize={10}
                tick={{ fill: "#9ca3af" }}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={renderTooltip}
                wrapperStyle={{ outline: "none" }}
              />
              <Bar dataKey="delta" radius={[2, 2, 0, 0]}>
                {model.rows.map((row) => (
                  <Cell
                    key={row.sector}
                    fill={row.winner === "A" ? model.colorA : model.colorB}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-[10px] text-white/40">
        <span>
          {model
            ? `${model.driverA.name_acronym} gains ${model.totalGainA.toFixed(2)}s · ${model.driverB.name_acronym} gains ${model.totalGainB.toFixed(2)}s`
            : `Per-sector time delta across ${SECTOR_COUNT} mini-sectors`}
        </span>
        <span>Data source: FastF1</span>
      </div>
    </div>
  );
}
