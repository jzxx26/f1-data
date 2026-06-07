"use client";
import { ChartContainer } from "@/components/common/ChartContainer";
import { LapDetail, useDetailedTelemetry } from "@/hooks/useLiveTelemetry";
import { getDriverColor, getTyreColor } from "@/lib/colors";
import { Driver } from "@/lib/openf1";
import { formatSeconds, formatTime } from "@/lib/utils";
import { useMemo, useState, useEffect } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
interface TelemetryChartProps {
  sessionKey?: number;
  data: Array<Record<string, number | undefined>>;
  drivers: Driver[];
  detailMap: Map<string, LapDetail>;
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  statusLabel?: string;
  footnote?: string;
}
export function TelemetryChart({
  sessionKey,
  data,
  drivers,
  detailMap,
  isLoading,
  title = "Telemetry Analysis",
  subtitle = "Real-time traces",
  statusLabel,
  footnote,
}: TelemetryChartProps) {
  const [mode, setMode] = useState<"overview" | "detailed">("overview");
  const [activeLap, setActiveLap] = useState<number | null>(null);
  // Detailed telemetry state
  const [d1, setD1] = useState<number | undefined>(undefined);
  const [d2, setD2] = useState<number | undefined>(undefined);
  const [selectedLap, setSelectedLap] = useState<number | undefined>(undefined);
  // Initialize drivers when loaded
  useEffect(() => {
    if (drivers && drivers.length > 0) {
      if (d1 === undefined) {
        setD1(drivers[0].driver_number);
      }
      if (d2 === undefined && drivers.length > 1) {
        setD2(drivers[1].driver_number);
      }
    }
  }, [drivers, d1, d2]);
  const { laps, carData, isLoading: isDetailedLoading, isFetching: isDetailedFetching } = useDetailedTelemetry(
    sessionKey,
    d1,
    d2,
    selectedLap,
    mode === "detailed"
  );
  const availableLaps = useMemo(() => {
    if (!laps || laps.length === 0 || d1 === undefined) return [];
    const set = new Set(
      laps.filter((l) => l.driver_number === d1).map((l) => l.lap_number)
    );
    return Array.from(set).sort((a, b) => a - b);
  }, [laps, d1]);
  // Handle selected lap auto-assignment
  useEffect(() => {
    if (availableLaps.length > 0) {
      if (selectedLap === undefined || !availableLaps.includes(selectedLap)) {
        setSelectedLap(availableLaps.at(-1));
      }
    }
  }, [availableLaps, selectedLap]);
  const d1Info = drivers.find((d) => d.driver_number === d1);
  const d2Info = drivers.find((d) => d.driver_number === d2);
  const d1Color = d1Info ? getDriverColor(d1Info) : "#ffffff";
  const d2Color = d2Info ? getDriverColor(d2Info) : "#a1a1aa";
  const detailedChartData = useMemo(() => {
    if (!laps || laps.length === 0 || !selectedLap || d1 === undefined) return [];
    const driver1Lap = laps.find(
      (l) => l.driver_number === d1 && l.lap_number === selectedLap
    );
    const driver2Lap = laps.find(
      (l) => l.driver_number === d2 && l.lap_number === selectedLap
    );
    const d1Start = driver1Lap?.date_start
      ? new Date(driver1Lap.date_start).getTime()
      : null;
    const d2Start = driver2Lap?.date_start
      ? new Date(driver2Lap.date_start).getTime()
      : null;
    const d1CarData = carData.find((d) => d.driverNum === d1)?.data ?? [];
    const d2CarData = carData.find((d) => d.driverNum === d2)?.data ?? [];
    const combinedList: Array<{
      elapsed: number;
      speed1?: number;
      throttle1?: number;
      brake1?: number;
      speed2?: number;
      throttle2?: number;
      brake2?: number;
    }> = [];
    if (d1Start) {
      d1CarData.forEach((p) => {
        const elapsed = (new Date(p.date).getTime() - d1Start) / 1000;
        if (
          elapsed >= 0 &&
          (!driver1Lap?.lap_duration || elapsed <= driver1Lap.lap_duration)
        ) {
          combinedList.push({
            elapsed: Number(elapsed.toFixed(2)),
            speed1: p.speed,
            throttle1: p.throttle,
            brake1: p.brake,
          });
        }
      });
    }
    if (d2Start && d2 !== undefined) {
      d2CarData.forEach((p) => {
        const elapsed = (new Date(p.date).getTime() - d2Start) / 1000;
        if (
          elapsed >= 0 &&
          (!driver2Lap?.lap_duration || elapsed <= driver2Lap.lap_duration)
        ) {
          combinedList.push({
            elapsed: Number(elapsed.toFixed(2)),
            speed2: p.speed,
            throttle2: p.throttle,
            brake2: p.brake,
          });
        }
      });
    }
    return combinedList.sort((a, b) => a.elapsed - b.elapsed);
  }, [carData, laps, selectedLap, d1, d2]);
  const chartLines = useMemo(
    () =>
      drivers.map((driver) => ({
        driver,
        stroke: getDriverColor(driver),
      })),
    [drivers]
  );
  const hasOverviewData = data.length > 0 && drivers.length > 0;
  const hasDetailedData = detailedChartData.length > 0 && d1 !== undefined;
  const renderTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    const lap = Number(label ?? 0);
    return (
      <div className="min-w-[220px] rounded-xl border border-white/10 bg-black/80 p-3 text-xs text-white/80 shadow-xl">
        <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-white/50">
          <span>Lap</span>
          <span className="text-white/70">{lap}</span>
        </div>
        <div className="flex flex-col gap-2">
          {payload.map((item) => {
            const driver = drivers.find(
              (entry) =>
                String(entry.driver_number) === String(item?.dataKey ?? "")
            );
            if (!driver) return null;
            const detail = detailMap.get(`${driver.driver_number}-${lap}`);
            return (
              <div
                key={driver.driver_number}
                className="flex flex-col gap-1 rounded-lg bg-white/5 p-2"
              >
                <div className="flex items-center justify-between text-[11px] font-medium text-white">
                  <span className="flex items-center gap-2">
                    <span
                      className="block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: getDriverColor(driver) }}
                      aria-hidden
                    />
                    {driver.broadcast_name}
                  </span>
                  <span className="text-white/70">
                    {Math.round(item?.value ?? 0)} km/h
                  </span>
                </div>
                {detail ? (
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-white/60">
                    <span>Tyre</span>
                    <span className="flex items-center gap-2 justify-end">
                      <span
                        aria-hidden
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: getTyreColor(detail.compound),
                        }}
                      />
                      {detail.compound ?? "--"}
                    </span>
                    <span>Lap Time</span>
                    <span className="text-right">
                      {formatTime(detail.lapTime)}
                    </span>
                    <span>Sectors</span>
                    <span className="text-right">{`${formatSeconds(
                      detail.sectors?.s1
                    )} / ${formatSeconds(detail.sectors?.s2)} / ${formatSeconds(
                      detail.sectors?.s3
                    )}`}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/5 bg-zinc-900/60 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex flex-col gap-4 border-b border-white/5 bg-zinc-900/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/60">
            {title}
          </p>
          <h2 className="text-lg font-semibold text-white">
            {mode === "overview" ? "Speed vs Lap Overview" : "Granular Lap Telemetry"}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl bg-black/40 p-0.5 border border-white/10">
            <button
              onClick={() => setMode("overview")}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                mode === "overview"
                  ? "bg-white/10 text-white shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                  : "text-white/40 hover:text-white"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setMode("detailed")}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                mode === "detailed"
                  ? "bg-white/10 text-white shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                  : "text-white/40 hover:text-white"
              }`}
            >
              Lap Telemetry
            </button>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
            {statusLabel ?? (isLoading || isDetailedFetching ? "Refreshing…" : "Updated")}
          </span>
        </div>
      </div>
      {mode === "overview" ? (
        <>
          <div
            className="relative w-full px-2 bg-zinc-950/50"
            style={{ height: "320px" }}
          >
            {!hasOverviewData ? (
              <div
                className="flex items-center justify-center text-xs text-white/40"
                style={{ height: "320px" }}
              >
                {drivers.length === 0
                  ? isLoading
                    ? "Loading drivers..."
                    : "Select drivers to view telemetry"
                  : "No telemetry data available yet"}
              </div>
            ) : (
              <ChartContainer height={320}>
                  <LineChart
                    data={data}
                    margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                    onMouseMove={(state) => {
                      if (state && state.activeLabel)
                        setActiveLap(Number(state.activeLabel));
                    }}
                    onMouseLeave={() => setActiveLap(null)}
                  >
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.15)"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="lap"
                      stroke="#9ca3af"
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                      fontSize={12}
                      tick={{ fill: "#9ca3af" }}
                    />
                    <YAxis
                      stroke="#9ca3af"
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                      fontSize={12}
                      domain={["auto", "auto"]}
                      tick={{ fill: "#9ca3af" }}
                      label={{
                        value: "Speed (km/h)",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#9ca3af",
                        fontSize: 11,
                      }}
                    />
                    <Tooltip
                      cursor={{ stroke: "rgba(148,163,184,0.4)", strokeWidth: 1 }}
                      content={renderTooltip}
                      wrapperStyle={{ outline: "none" }}
                    />
                    <Legend
                      formatter={(value, entry) => {
                        const payload = entry as { dataKey?: string };
                        const driver = drivers.find(
                          (item) =>
                            String(item.driver_number) ===
                            String(payload.dataKey ?? "")
                        );
                        return driver ? driver.name_acronym : value;
                      }}
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{
                        paddingTop: 12,
                        color: "rgba(255,255,255,0.65)",
                        fontSize: 12,
                      }}
                    />
                    {chartLines.map(({ driver, stroke }) => (
                      <Line
                        key={driver.driver_number}
                        type="monotone"
                        dataKey={String(driver.driver_number)}
                        name={driver.name_acronym}
                        stroke={stroke}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
              </ChartContainer>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-[11px] text-white/50">
            <span>
              {activeLap
                ? `Focusing lap ${activeLap}`
                : "Hover or tap to inspect a lap"}
            </span>
            <span>{footnote ?? "Data source: FastF1"}</span>
          </div>
        </>
      ) : (
        <div className="bg-zinc-950/50 p-4">
          <div className="mb-4 grid grid-cols-3 gap-3 rounded-2xl border border-white/5 bg-zinc-900/60 p-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
                Driver 1
              </label>
              <select
                value={d1}
                onChange={(e) => setD1(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-1.5 text-xs text-white outline-none"
              >
                {drivers.map((d) => (
                  <option key={d.driver_number} value={d.driver_number}>
                    {d.name_acronym} ({d.driver_number})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
                Driver 2
              </label>
              <select
                value={d2 ?? ""}
                onChange={(e) => setD2(e.target.value ? Number(e.target.value) : undefined)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-1.5 text-xs text-white outline-none"
              >
                <option value="">None</option>
                {drivers
                  .filter((d) => d.driver_number !== d1)
                  .map((d) => (
                    <option key={d.driver_number} value={d.driver_number}>
                      {d.name_acronym} ({d.driver_number})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
                Lap Number
              </label>
              <select
                value={selectedLap ?? ""}
                onChange={(e) => setSelectedLap(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-1.5 text-xs text-white outline-none"
              >
                {availableLaps.map((lap) => (
                  <option key={lap} value={lap}>
                    Lap {lap}
                  </option>
                ))}
                {availableLaps.length === 0 && (
                  <option value="">No laps available</option>
                )}
              </select>
            </div>
          </div>
          {!hasDetailedData ? (
            <div className="flex h-[320px] items-center justify-center text-xs text-white/40">
              {isDetailedLoading ? "Loading lap telemetry..." : "No detailed telemetry data available for this lap."}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Speed trace */}
              <div>
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Speed (km/h)
                </p>
                <ChartContainer height={140}>
                    <LineChart   syncId="telemetry" data={detailedChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                      <XAxis dataKey="elapsed" type="number" hide />
                      <YAxis domain={[0, 350]} stroke="#9ca3af" fontSize={9} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload) return null;
                          return (
                            <div className="rounded-lg border border-white/10 bg-black/90 p-2 text-[10px] text-white">
                              {payload.map((item, idx) => (
                                <div key={idx} style={{ color: item.color }}>
                                  {item.name}: {Math.round(Number(item.value))} km/h
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Line
                        dataKey="speed1"
                        name={d1Info?.name_acronym ?? "D1"}
                        stroke={d1Color}
                        dot={false}
                        connectNulls
                        strokeWidth={2}
                      />
                      {d2 !== undefined && (
                        <Line
                          dataKey="speed2"
                          name={d2Info?.name_acronym ?? "D2"}
                          stroke={d2Color}
                          dot={false}
                          connectNulls
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                        />
                      )}
                    </LineChart>
                </ChartContainer>
              </div>
              {/* Throttle trace */}
              <div>
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Throttle (%)
                </p>
                <ChartContainer height={80}>
                    <LineChart   syncId="telemetry" data={detailedChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                      <XAxis dataKey="elapsed" type="number" hide />
                      <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={9} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload) return null;
                          return (
                            <div className="rounded-lg border border-white/10 bg-black/90 p-2 text-[10px] text-white">
                              {payload.map((item, idx) => (
                                <div key={idx} style={{ color: item.color }}>
                                  {item.name}: {Math.round(Number(item.value))}%
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Line
                        dataKey="throttle1"
                        name={d1Info?.name_acronym ?? "D1"}
                        stroke={d1Color}
                        dot={false}
                        connectNulls
                        strokeWidth={2}
                      />
                      {d2 !== undefined && (
                        <Line
                          dataKey="throttle2"
                          name={d2Info?.name_acronym ?? "D2"}
                          stroke={d2Color}
                          dot={false}
                          connectNulls
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                        />
                      )}
                    </LineChart>
                </ChartContainer>
              </div>
              {/* Brake trace */}
              <div>
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Brake (%)
                </p>
                <ChartContainer height={80}>
                    <LineChart   syncId="telemetry" data={detailedChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                      <XAxis dataKey="elapsed" type="number" stroke="#9ca3af" fontSize={9} />
                      <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={9} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload) return null;
                          return (
                            <div className="rounded-lg border border-white/10 bg-black/90 p-2 text-[10px] text-white">
                              {payload.map((item, idx) => (
                                <div key={idx} style={{ color: item.color }}>
                                  {item.name}: {item.value ? "ON" : "OFF"}
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Line
                        dataKey="brake1"
                        name={d1Info?.name_acronym ?? "D1"}
                        stroke={d1Color}
                        dot={false}
                        connectNulls
                        strokeWidth={2}
                      />
                      {d2 !== undefined && (
                        <Line
                          dataKey="brake2"
                          name={d2Info?.name_acronym ?? "D2"}
                          stroke={d2Color}
                          dot={false}
                          connectNulls
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                        />
                      )}
                    </LineChart>
                </ChartContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
