"use client";

import { useLiveData } from "@/components/live/dashboard/LiveData";

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function Weather() {
  const { snapshot } = useLiveData();
  const w = snapshot?.weather;
  if (!w) return <p className="py-4 text-center text-xs text-white/50">No weather yet.</p>;
  const wind = num(w.WindSpeed);
  const direction = num(w.WindDirection);
  const rain = num(w.Rainfall);
  const items: [string, string][] = [
    ["Air", num(w.AirTemp) !== null ? `${num(w.AirTemp)!.toFixed(1)} °C` : "–"],
    ["Track", num(w.TrackTemp) !== null ? `${num(w.TrackTemp)!.toFixed(1)} °C` : "–"],
    ["Humidity", num(w.Humidity) !== null ? `${num(w.Humidity)!.toFixed(0)} %` : "–"],
    [
      "Wind",
      wind !== null
        ? `${(wind * 3.6).toFixed(0)} km/h${direction !== null ? ` ${COMPASS[Math.round(direction / 45) % 8]}` : ""}`
        : "–",
    ],
    ["Rain", rain === null ? "–" : rain > 0 ? "Yes" : "No"],
    ["Pressure", num(w.Pressure) !== null ? `${num(w.Pressure)!.toFixed(0)} hPa` : "–"],
  ];
  return (
    <div className="@container grid h-full grid-cols-2 content-start gap-1.5 overflow-auto @xs:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1">
          <div className="text-[9px] uppercase tracking-[0.2em] text-white/40">{label}</div>
          <div className={`text-sm tabular-nums ${label === "Rain" && value === "Yes" ? "text-sky-300" : "text-white"}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}
