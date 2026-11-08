"use client";

import { teamColour, type LiveDriver, type LivePositions } from "@/lib/live";
import { useMemo } from "react";

interface TrackMapCardProps {
  data: LivePositions | undefined;
  drivers: LiveDriver[];
  selected: string | null;
  tokenSet: boolean;
}

const SIZE = 400;
const PAD = 24;

export function TrackMapCard({ data, drivers, selected, tokenSet }: TrackMapCardProps) {
  const view = useMemo(() => {
    if (!data?.has_data) return null;
    const points = [...data.outline, ...data.cars.map((c) => [c.x, c.y] as [number, number])];
    if (points.length === 0) return null;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
    const scale = (SIZE - PAD * 2) / span;
    // SVG y grows downwards; the feed's y grows upwards.
    const project = (x: number, y: number) => [PAD + (x - minX) * scale, SIZE - PAD - (y - minY) * scale];
    return {
      path: data.outline.map(([x, y], i) => `${i ? "L" : "M"}${project(x, y).join(" ")}`).join(" "),
      cars: data.cars.map((car) => ({ ...car, at: project(car.x, car.y) })),
    };
  }, [data]);

  if (!view) {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-xs text-white/50">
        {tokenSet
          ? "No positions yet. They arrive once a session is running."
          : "Car positions need an F1TV subscription token: set F1TV_SUBSCRIPTION_TOKEN in backend/.env."}
      </p>
    );
  }
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img" aria-label="Car positions on track">
      <path d={view.path} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={10} strokeLinejoin="round" />
      {view.cars.map((car) => {
        const isSelected = car.driver === selected;
        return (
          <g key={car.driver}>
            <circle
              cx={car.at[0]}
              cy={car.at[1]}
              r={isSelected ? 8 : 5.5}
              fill={teamColour(drivers, car.driver)}
              stroke={isSelected ? "#fff" : "#0a0a0c"}
              strokeWidth={isSelected ? 2 : 1}
            />
            <text x={car.at[0] + 9} y={car.at[1] + 3} fontSize={10} fill="rgba(255,255,255,0.75)">
              {car.driver}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
