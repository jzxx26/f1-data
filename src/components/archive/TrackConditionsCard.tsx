"use client";

import type { WeatherData } from "@/lib/openf1";
import { useMemo } from "react";

interface TrackConditionsCardProps {
  weather: WeatherData[];
  isLoading?: boolean;
}

interface Stat {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
}

function avg(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function TrackConditionsCard({
  weather,
  isLoading,
}: TrackConditionsCardProps) {
  const stats = useMemo<Stat[]>(() => {
    if (weather.length === 0) return [];

    const airTemps = weather
      .map((w) => w.air_temp)
      .filter((v): v is number => typeof v === "number");
    const trackTemps = weather
      .map((w) => w.track_temp)
      .filter((v): v is number => typeof v === "number");
    const winds = weather
      .map((w) => w.wind_speed)
      .filter((v): v is number => typeof v === "number");
    const humidity = weather
      .map((w) => w.humidity)
      .filter((v): v is number => typeof v === "number");

    const rainSamples = weather.filter((w) => w.rainfall === true).length;
    const rainPct = (rainSamples / weather.length) * 100;

    const airAvg = avg(airTemps);
    const trackAvg = avg(trackTemps);
    const windAvg = avg(winds);
    const humAvg = avg(humidity);

    const airMin = airTemps.length ? Math.min(...airTemps) : null;
    const airMax = airTemps.length ? Math.max(...airTemps) : null;
    const trackMin = trackTemps.length ? Math.min(...trackTemps) : null;
    const trackMax = trackTemps.length ? Math.max(...trackTemps) : null;

    return [
      {
        label: "Air temp",
        value: airAvg != null ? airAvg.toFixed(1) : "--",
        unit: "°C",
        detail:
          airMin != null && airMax != null
            ? `${airMin.toFixed(1)}–${airMax.toFixed(1)}°C`
            : undefined,
      },
      {
        label: "Track temp",
        value: trackAvg != null ? trackAvg.toFixed(1) : "--",
        unit: "°C",
        detail:
          trackMin != null && trackMax != null
            ? `${trackMin.toFixed(1)}–${trackMax.toFixed(1)}°C`
            : undefined,
      },
      {
        label: "Wind",
        value: windAvg != null ? windAvg.toFixed(1) : "--",
        unit: "m/s",
      },
      {
        label: "Humidity",
        value: humAvg != null ? humAvg.toFixed(0) : "--",
        unit: "%",
      },
      {
        label: "Rainfall",
        value: rainSamples > 0 ? `${rainPct.toFixed(0)}` : "0",
        unit: "% of session",
        detail: rainSamples > 0 ? "Wet conditions detected" : "Dry session",
      },
    ];
  }, [weather]);

  return (
    <section className="rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Conditions
          </p>
          <h2 className="text-lg font-semibold text-white">Track conditions</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isLoading ? "Loading…" : `${weather.length} samples`}
        </span>
      </header>
      {stats.length === 0 ? (
        <div className="flex h-[140px] items-center justify-center text-xs text-white/40">
          {isLoading ? "Loading conditions…" : "No weather data available."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3 py-3"
            >
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                {stat.label}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-semibold text-white">{stat.value}</span>
                {stat.unit ? (
                  <span className="text-xs text-white/45">{stat.unit}</span>
                ) : null}
              </div>
              {stat.detail ? (
                <div className="mt-1 text-[10px] text-white/45">{stat.detail}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
