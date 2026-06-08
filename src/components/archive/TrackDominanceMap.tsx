"use client";

import { getDriverColor } from "@/lib/colors";
import type { Driver, LapTelemetry } from "@/lib/openf1";
import { computeMiniSectors } from "@/lib/telemetry";
import { useMemo } from "react";

interface TrackDominanceMapProps {
  telemetry: LapTelemetry[];
  drivers: Driver[];
  isLoading?: boolean;
}

const SECTOR_COUNT = 30;

export function TrackDominanceMap({
  telemetry,
  drivers,
  isLoading,
}: TrackDominanceMapProps) {
  const model = useMemo(() => {
    if (telemetry.length < 2) return null;

    const a = telemetry[0];
    const b = telemetry[1];
    const driverA = drivers.find((d) => d.driver_number === a.driver_number);
    const driverB = drivers.find((d) => d.driver_number === b.driver_number);
    if (!driverA || !driverB || a.points.length < 2) return null;

    const colorA = getDriverColor(driverA);
    const colorB = getDriverColor(driverB);

    const { sectors, maxDistance } = computeMiniSectors(
      a.points,
      b.points,
      SECTOR_COUNT
    );
    if (sectors.length === 0) return null;

    // Project driver A's racing line into a normalised SVG box (flip Y axis).
    const xs = a.points.map((p) => p.x);
    const ys = a.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 24;
    const target = 760;
    const scale = Math.min(target / rangeX, target / rangeY);
    const width = rangeX * scale + pad * 2;
    const height = rangeY * scale + pad * 2;
    const project = (x: number, y: number): [number, number] => [
      pad + (x - minX) * scale,
      pad + (maxY - y) * scale,
    ];

    // Build coloured polyline segments — one per contiguous mini-sector run.
    const segments: { color: string; points: string }[] = [];
    let currentSector = -1;
    let coords: string[] = [];
    let prevColor = colorA;

    a.points.forEach((p) => {
      const idx = Math.min(
        SECTOR_COUNT - 1,
        Math.max(0, Math.floor((p.distance / maxDistance) * SECTOR_COUNT))
      );
      const color = sectors[idx].winner === "A" ? colorA : colorB;
      const [px, py] = project(p.x, p.y);
      const coord = `${px.toFixed(1)},${py.toFixed(1)}`;

      if (idx !== currentSector) {
        if (coords.length > 0) {
          coords.push(coord); // bridge the gap to the next segment
          segments.push({ color: prevColor, points: coords.join(" ") });
        }
        coords = [coord];
        currentSector = idx;
        prevColor = color;
      } else {
        coords.push(coord);
      }
    });
    if (coords.length > 0) {
      segments.push({ color: prevColor, points: coords.join(" ") });
    }

    const wonA = sectors.filter((s) => s.winner === "A").length;
    const wonB = sectors.length - wonA;

    return {
      driverA,
      driverB,
      colorA,
      colorB,
      segments,
      width,
      height,
      wonA,
      wonB,
      total: sectors.length,
      lapTimeA: a.lap_time ?? null,
      lapTimeB: b.lap_time ?? null,
    };
  }, [telemetry, drivers]);

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/5 bg-zinc-900/60 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex flex-col gap-1 border-b border-white/5 bg-zinc-900/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Track Dominance
          </p>
          <h2 className="text-lg font-semibold text-white">
            Who&apos;s faster, where
          </h2>
        </div>
        {model && (
          <div className="flex items-center gap-4 text-[11px]">
            <LegendChip
              color={model.colorA}
              label={model.driverA.name_acronym}
              won={model.wonA}
              total={model.total}
            />
            <LegendChip
              color={model.colorB}
              label={model.driverB.name_acronym}
              won={model.wonB}
              total={model.total}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center bg-zinc-950/50 p-4">
        {!model ? (
          <div className="flex h-[360px] items-center justify-center text-xs text-white/40">
            {isLoading
              ? "Loading fastest-lap telemetry…"
              : "Select two drivers to compare their fastest laps"}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${model.width} ${model.height}`}
            className="h-auto w-full max-h-[460px]"
            style={{ maxWidth: model.width }}
          >
            {model.segments.map((seg, i) => (
              <polyline
                key={i}
                points={seg.points}
                fill="none"
                stroke={seg.color}
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-[10px] text-white/40">
        <span>
          Each segment coloured by the faster driver across {SECTOR_COUNT}{" "}
          mini-sectors of the fastest lap
        </span>
        <span>Data source: FastF1</span>
      </div>
    </div>
  );
}

function LegendChip({
  color,
  label,
  won,
  total,
}: {
  color: string;
  label: string;
  won: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((won / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
        {label}
      </span>
      <span className="font-mono text-white/50">{pct}%</span>
    </div>
  );
}
