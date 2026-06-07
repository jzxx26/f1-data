"use client";

import { TelemetryChart } from "./TelemetryChart";
import {
  useMeetingDrivers,
  useMeetingRaceSession,
  useRaceMeetings,
  useRaceTelemetry,
  useSessionLaps,
  useSessionLapsAll,
  useSessionPositions,
  useSessionResults,
  useSessionStints,
  useSessionWeather,
  type RaceFilters,
} from "@/hooks/useRaceArchive";
import { getDriverColor, getTyreColor } from "@/lib/colors";
import type { Driver, StintData } from "@/lib/openf1";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

import { BiggestMoversCard } from "./BiggestMoversCard";
import { ConsistencyCard } from "./ConsistencyCard";
import { FastestLapsCard } from "./FastestLapsCard";
import { PoleLapCard } from "./PoleLapCard";
import { PositionChart } from "./PositionChart";
import { QualifyingResultsTable } from "./QualifyingResultsTable";
import { RacePaceChart } from "./RacePaceChart";
import { RaceResultsTable } from "./RaceResultsTable";
import { SectorGapChart } from "./SectorGapChart";
import { TimeDeltaChart } from "./TimeDeltaChart";
import { TopSpeedsCard } from "./TopSpeedsCard";
import { TrackConditionsCard } from "./TrackConditionsCard";
import { TyreDegChart } from "./TyreDegChart";

const CURRENT_YEAR = new Date().getFullYear();
const ARCHIVE_START_YEAR = 2018;

export function RaceArchive() {
  const [filters, setFilters] = useState<RaceFilters>({ year: CURRENT_YEAR });
  const meetingsQuery = useRaceMeetings(filters);
  const [selectedMeeting, setSelectedMeeting] = useState<number | null>(null);
  const [sessionType, setSessionType] = useState<"Race" | "Qualifying">("Race");

  useEffect(() => {
    if (!meetingsQuery.data || meetingsQuery.data.length === 0) {
      setSelectedMeeting(null);
      return;
    }
    const exists = meetingsQuery.data.some(
      (meeting) => meeting.meeting_key === selectedMeeting
    );
    if (!exists) {
      setSelectedMeeting(meetingsQuery.data[0].meeting_key);
    }
  }, [meetingsQuery.data, selectedMeeting]);

  const sessionQuery = useMeetingRaceSession(selectedMeeting ?? undefined, sessionType);
  const driversQuery = useMeetingDrivers(sessionQuery.data?.session_key);

  const [selectedDrivers, setSelectedDrivers] = useState<number[]>([]);

  useEffect(() => {
    if (
      driversQuery.data &&
      driversQuery.data.length > 0 &&
      selectedDrivers.length === 0
    ) {
      setSelectedDrivers(
        driversQuery.data.slice(0, 2).map((driver) => driver.driver_number)
      );
    }
  }, [driversQuery.data, selectedDrivers.length]);

  const chosenDrivers = useMemo(() => {
    if (!driversQuery.data) return [] as Driver[];
    return driversQuery.data.filter((driver) =>
      selectedDrivers.includes(driver.driver_number)
    );
  }, [driversQuery.data, selectedDrivers]);

  const telemetryQuery = useRaceTelemetry(
    sessionQuery.data?.session_key,
    chosenDrivers
  );
  const stintsQuery = useSessionStints(sessionQuery.data?.session_key);

  // Laps scoped to the selected drivers (for delta/sector/tyre comparison views)
  const lapsQuery = useSessionLaps(
    sessionQuery.data?.session_key,
    selectedDrivers.length > 0 ? selectedDrivers : undefined
  );
  // All laps (for fastest lap, top speed, pace distribution — independent of selection)
  const allLapsQuery = useSessionLapsAll(sessionQuery.data?.session_key);
  const resultsQuery = useSessionResults(sessionQuery.data?.session_key);
  const positionsQuery = useSessionPositions(sessionQuery.data?.session_key);
  const weatherQuery = useSessionWeather(sessionQuery.data?.session_key);

  const meetingOptions = meetingsQuery.data ?? [];
  return (
    <div className="flex w-full flex-col gap-6 lg:gap-8">
      <header className="rounded-2xl border border-white/[0.06] bg-[#111114] p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-white/45">
                Race Archive
              </p>
              <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5">
                <button
                  onClick={() => setSessionType("Race")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition",
                    sessionType === "Race"
                      ? "bg-white/15 text-white"
                      : "text-white/40 hover:text-white"
                  )}
                >
                  Race
                </button>
                <button
                  onClick={() => setSessionType("Qualifying")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition",
                    sessionType === "Qualifying"
                      ? "bg-white/15 text-white"
                      : "text-white/40 hover:text-white"
                  )}
                >
                  Qualifying
                </button>
              </div>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {sessionQuery.data?.location ?? "Select a race"}
            </h1>
            <p className="text-sm text-white/55">
              {sessionQuery.data
                ? `${
                    sessionQuery.data.country_name ?? ""
                  } · ${
                    sessionQuery.data.session_name ?? "Race"
                  } · session ${sessionQuery.data.session_key}`
                : "Filter by season and pick a race to load full post-race analytics — pace, sectors, tyres, telemetry, weather."}
            </p>
          </div>
          <SearchPanel
            filters={filters}
            onFiltersChange={setFilters}
            meetings={meetingOptions}
            onSelectMeeting={setSelectedMeeting}
            selectedMeeting={selectedMeeting}
          />
        </div>
      </header>

      {/* Top-of-page result block, swaps based on session type */}
      {sessionType === "Race" ? (
        <RaceResultsTable
          results={resultsQuery.data ?? []}
          drivers={driversQuery.data ?? []}
          isLoading={resultsQuery.isLoading}
        />
      ) : (
        <>
          <PoleLapCard
            results={resultsQuery.data ?? []}
            laps={allLapsQuery.data ?? []}
            drivers={driversQuery.data ?? []}
            isLoading={resultsQuery.isLoading || allLapsQuery.isLoading}
          />
          <QualifyingResultsTable
            results={resultsQuery.data ?? []}
            drivers={driversQuery.data ?? []}
            isLoading={resultsQuery.isLoading}
          />
        </>
      )}

      {/* Driver selector — drives every comparison chart below */}
      <DriverSelector
        drivers={driversQuery.data ?? []}
        selected={selectedDrivers}
        onChange={setSelectedDrivers}
        disabled={driversQuery.isLoading}
      />

      {/* Track conditions overview */}
      <TrackConditionsCard
        weather={weatherQuery.data ?? []}
        isLoading={weatherQuery.isLoading}
      />

      {/* Race story: position changes per lap */}
      {sessionType === "Race" && (
        <PositionChart
          positions={positionsQuery.data ?? []}
          drivers={driversQuery.data ?? []}
          highlight={selectedDrivers.length > 0 ? selectedDrivers : undefined}
          isLoading={positionsQuery.isLoading}
        />
      )}

      {/* Pace distribution (clean laps) */}
      {sessionType === "Race" && (
        <RacePaceChart
          laps={allLapsQuery.data ?? []}
          drivers={driversQuery.data ?? []}
          isLoading={allLapsQuery.isLoading}
        />
      )}

      {/* Fastest laps + top speeds (all drivers, independent of selection) */}
      <section className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <FastestLapsCard
          laps={allLapsQuery.data ?? []}
          drivers={driversQuery.data ?? []}
          isLoading={allLapsQuery.isLoading}
        />
        <TopSpeedsCard
          laps={allLapsQuery.data ?? []}
          drivers={driversQuery.data ?? []}
          isLoading={allLapsQuery.isLoading}
        />
      </section>

      {/* Consistency + biggest movers */}
      {sessionType === "Race" && (
        <section className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <ConsistencyCard
            laps={allLapsQuery.data ?? []}
            drivers={driversQuery.data ?? []}
            isLoading={allLapsQuery.isLoading}
          />
          <BiggestMoversCard
            positions={positionsQuery.data ?? []}
            results={resultsQuery.data ?? []}
            drivers={driversQuery.data ?? []}
            isLoading={positionsQuery.isLoading || resultsQuery.isLoading}
          />
        </section>
      )}

      {/* Row 1: Telemetry + Pit Strategy */}
      <section className="grid gap-6 lg:grid-cols-[2fr,1fr] lg:gap-8">
        <TelemetryChart
          sessionKey={sessionQuery.data?.session_key}
          data={telemetryQuery.chartData}
          drivers={chosenDrivers}
          detailMap={telemetryQuery.detailMap}
          isLoading={telemetryQuery.isFetching}
          title="Telemetry Comparison"
          subtitle={sessionSubtitle(sessionQuery.data)}
          statusLabel={telemetryStatusLabel(telemetryQuery.isFetching)}
          footnote={sessionFootnote(sessionQuery.data)}
        />
        <PitStrategyPanel
          stints={stintsQuery.data ?? []}
          drivers={driversQuery.data ?? []}
          driverFilter={selectedDrivers}
          isLoading={stintsQuery.isLoading}
        />
      </section>

      {/* Row 2: Time Delta + Sector Gap (theoretical ultimate) */}
      <section className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <TimeDeltaChart
          laps={lapsQuery.data ?? []}
          drivers={chosenDrivers}
          isLoading={lapsQuery.isLoading}
        />
        <SectorGapChart
          laps={lapsQuery.data ?? []}
          drivers={chosenDrivers}
          isLoading={lapsQuery.isLoading}
        />
      </section>

      {/* Row 3: Tyre Degradation (full width) */}
      {sessionType === "Race" && (
        <section>
          <TyreDegChart
            laps={lapsQuery.data ?? []}
            stints={stintsQuery.data ?? []}
            drivers={chosenDrivers}
            isLoading={lapsQuery.isLoading || stintsQuery.isLoading}
          />
        </section>
      )}
    </div>
  );
}

interface SearchPanelProps {
  filters: RaceFilters;
  onFiltersChange: (filters: RaceFilters) => void;
  meetings: Array<{
    meeting_key: number;
    meeting_name: string;
    location: string;
    date_start: string;
  }>;
  onSelectMeeting: (meetingKey: number | null) => void;
  selectedMeeting: number | null;
}

function SearchPanel({
  filters,
  onFiltersChange,
  meetings,
  onSelectMeeting,
  selectedMeeting,
}: SearchPanelProps) {
  const years = useMemo(() => {
    return Array.from(
      { length: CURRENT_YEAR - ARCHIVE_START_YEAR + 1 },
      (_, index) => CURRENT_YEAR - index
    );
  }, []);

  return (
    <div className="flex w-full flex-1 flex-col gap-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-white/70">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.3em] text-white/40">
            Season
          </span>
          <select
            value={filters.year ?? CURRENT_YEAR}
            onChange={(event) =>
              onFiltersChange({ ...filters, year: Number(event.target.value) })
            }
            className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.3em] text-white/40">
            Circuit search
          </span>
          <input
            type="text"
            placeholder="e.g. Austin"
            value={filters.circuit ?? ""}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                circuit: event.target.value || undefined,
              })
            }
            className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.3em] text-white/40">
            Driver number
          </span>
          <input
            type="number"
            min={1}
            max={99}
            value={filters.driverNumber ?? ""}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                driverNumber: event.target.value
                  ? Number(event.target.value)
                  : undefined,
              })
            }
            className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </label>
      </div>
      <div className="flex h-12 items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/50 px-3 text-xs text-white/60">
        <span className="text-[11px] uppercase tracking-[0.3em] text-white/40">
          Select meeting
        </span>
        <select
          value={selectedMeeting ?? ""}
          onChange={(event) =>
            onSelectMeeting(
              event.target.value ? Number(event.target.value) : null
            )
          }
          className="w-2/3 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          {meetings.length === 0 ? (
            <option value="" disabled>
              No meetings found for this filter
            </option>
          ) : null}
          {meetings.map((meeting) => (
            <option key={meeting.meeting_key} value={meeting.meeting_key}>
              {meeting.meeting_name} •{" "}
              {new Date(meeting.date_start).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface DriverSelectorProps {
  drivers: Driver[];
  selected: number[];
  onChange: (values: number[]) => void;
  disabled?: boolean;
}

export function DriverSelector({
  drivers,
  selected,
  onChange,
  disabled,
}: DriverSelectorProps) {
  const toggleDriver = (driverNumber: number) => {
    if (selected.includes(driverNumber)) {
      onChange(selected.filter((value) => value !== driverNumber));
    } else if (selected.length < 2) {
      onChange([...selected, driverNumber]);
    } else {
      onChange([selected[1], driverNumber]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-4">
      <span className="text-[11px] uppercase tracking-[0.3em] text-white/40">
        Compare drivers
      </span>
      <div className="flex flex-wrap gap-2">
        {drivers.map((driver) => {
          const isSelected = selected.includes(driver.driver_number);
          return (
            <button
              key={driver.driver_number}
              type="button"
              onClick={() => toggleDriver(driver.driver_number)}
              disabled={disabled}
              className={cn(
                "flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold transition",
                isSelected
                  ? "bg-white/20 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                  : "bg-white/5 text-white/60 hover:bg-white/10"
              )}
              aria-pressed={isSelected}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: getDriverColor(driver) }}
                aria-hidden
              />
              {driver.name_acronym}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface PitStrategyPanelProps {
  stints: StintData[];
  drivers: Driver[];
  driverFilter: number[];
  isLoading?: boolean;
}

export function PitStrategyPanel({
  stints,
  drivers,
  driverFilter,
  isLoading,
}: PitStrategyPanelProps) {
  const stintsByDriver = useMemo(() => {
    const map = new Map<number, StintData[]>();
    stints.forEach((stint) => {
      if (
        driverFilter.length > 0 &&
        !driverFilter.includes(stint.driver_number)
      )
        return;
      if (!map.has(stint.driver_number)) map.set(stint.driver_number, []);
      map.get(stint.driver_number)?.push(stint);
    });
    return map;
  }, [stints, driverFilter]);

  return (
    <aside className="flex h-full flex-col gap-4 rounded-3xl border border-white/5 bg-black/60 p-5 text-sm text-white/70 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Pit strategy
          </p>
          <h2 className="text-lg font-semibold text-white">Stints overview</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isLoading ? "Loading…" : `${stints.length} entries`}
        </span>
      </div>
      {stintsByDriver.size === 0 ? (
        <p className="mt-6 text-xs text-white/40">
          Select a race to view tyre stints and pit information.
        </p>
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          {Array.from(stintsByDriver.entries()).map(
            ([driverNumber, driverStints]) => {
              const driver = drivers.find(
                (item) => item.driver_number === driverNumber
              );
              const color = driver ? getDriverColor(driver) : "#6b7280";
              return (
                <div
                  key={driverNumber}
                  className="rounded-2xl border border-white/5 bg-black/40 p-4"
                >
                  <div className="mb-3 flex items-center justify-between text-xs text-white/60">
                    <span className="flex items-center gap-2 text-sm font-semibold text-white">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {driver?.broadcast_name ?? `Driver ${driverNumber}`}
                    </span>
                    <span>{driverStints.length} stints</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {driverStints
                      .sort(
                        (a, b) => (a.stint_number ?? 0) - (b.stint_number ?? 0)
                      )
                      .map((stint) => (
                        <div
                          key={`${driverNumber}-${stint.stint_number}`}
                          className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs"
                        >
                          <span className="flex items-center gap-2 font-semibold text-white">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: getTyreColor(stint.compound),
                              }}
                              aria-hidden
                            />
                            {stint.compound ?? "Tyre"}
                          </span>
                          <span className="text-white/60">
                            Laps {stint.lap_start ?? "?"} –{" "}
                            {stint.lap_end ?? "?"}
                          </span>
                          <span className="text-white/50">
                            Tyre age: {stint.tyre_age_at_start ?? "--"}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </aside>
  );
}

function sessionSubtitle(
  session?: {
    location?: string;
    session_name?: string;
    date_start?: string;
  } | null
) {
  if (!session) return "Select drivers to compare";
  const date = session.date_start ? new Date(session.date_start) : undefined;
  return `${session.location ?? ""} • ${session.session_name ?? "Race"} ${
    date ? `• ${date.toLocaleDateString()}` : ""
  }`.trim();
}

function sessionFootnote(
  session?: {
    country_name?: string;
    meeting_key?: number;
    session_key?: number;
  } | null
) {
  if (!session) return "Historical data from FastF1";
  return `${session.country_name ?? ""} • Session key ${
    session.session_key ?? "--"
  }`;
}

function telemetryStatusLabel(isFetching: boolean) {
  return isFetching ? "Fetching" : "Archive snapshot";
}
