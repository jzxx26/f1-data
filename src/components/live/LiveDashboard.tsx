"use client";

import { LiveTelemetryCard } from "@/components/live/LiveTelemetryCard";
import { LiveTower } from "@/components/live/LiveTower";
import { RaceControlCard } from "@/components/live/RaceControlCard";
import { StrategyCard } from "@/components/live/StrategyCard";
import { TrackMapCard } from "@/components/live/TrackMapCard";
import {
  useLiveControls,
  useLivePositions,
  useLiveSnapshot,
  useLiveStatus,
  useLiveStrategy,
  useLiveTelemetry,
} from "@/hooks/useLive";
import type { LiveSession, LiveStatus } from "@/lib/live";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

const FLAG_STYLES: Record<string, string> = {
  GREEN: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  YELLOW: "bg-yellow-400/15 text-yellow-200 ring-yellow-300/30",
  "SAFETY CAR": "bg-amber-500/20 text-amber-200 ring-amber-400/40",
  VSC: "bg-amber-500/20 text-amber-200 ring-amber-400/40",
  RED: "bg-red-500/20 text-red-200 ring-red-400/40",
};
const FLAG_LABEL: Record<string, string> = { "SAFETY CAR": "SC" };
const SPEEDS = [1, 5, 20, 60];
const STALE_AFTER_S = 30;

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function TokenPill({ status }: { status: LiveStatus }) {
  const { token } = status;
  const days = daysLeft(token.expires);
  const tone = !token.set || token.expired ? "warn" : days !== null && days < 3 ? "soon" : "ok";
  const text = !token.set
    ? "No F1TV token: timing only"
    : token.expired
      ? "F1TV token expired: renew it in backend/.env"
      : days === null
        ? "F1TV token set"
        : `F1TV token: ${days < 1 ? "expires today" : `${days} day${days === 1 ? "" : "s"} left`}`;
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-[11px] ring-1",
        tone === "ok" && "bg-white/5 text-white/60 ring-white/10",
        tone === "soon" && "bg-amber-400/10 text-amber-200 ring-amber-300/30",
        tone === "warn" && "bg-red-500/10 text-red-200 ring-red-400/30"
      )}
    >
      {text}
    </span>
  );
}

function SessionHeader({ session }: { session: LiveSession }) {
  const stale = session.data_age_s !== null && session.data_age_s > STALE_AFTER_S;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-white/5 bg-black/40 px-6 py-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
          {session.session_name || "Session"} · {session.circuit ?? session.country ?? ""}
        </p>
        <h1 className="text-2xl font-semibold text-white">{session.gp}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {session.current_lap ? (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Lap</div>
            <div className="text-xl font-semibold tabular-nums text-white">
              {session.current_lap}
              {session.total_laps ? <span className="text-white/40"> / {session.total_laps}</span> : null}
            </div>
          </div>
        ) : null}
        {session.clock_remaining ? (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Remaining</div>
            <div className="text-xl font-semibold tabular-nums text-white">{session.clock_remaining}</div>
          </div>
        ) : null}
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold ring-1",
            FLAG_STYLES[session.flag] ?? "bg-white/5 text-white/70 ring-white/10"
          )}
          title={session.track_message ?? undefined}
        >
          {FLAG_LABEL[session.flag] ?? session.flag}
        </span>
        <span className={cn("text-[11px]", stale ? "text-amber-200" : "text-white/45")}>
          {session.data_age_s === null
            ? "No update yet"
            : stale
              ? `No update for ${Math.round(session.data_age_s)} s`
              : `Updated ${Math.round(session.data_age_s)} s ago`}
        </span>
      </div>
    </div>
  );
}

export function LiveDashboard() {
  const status = useLiveStatus();
  const { start, stop } = useLiveControls();
  const active = Boolean(status.data?.enabled && status.data.mode !== "off");
  const snapshot = useLiveSnapshot(active);
  const [speed, setSpeed] = useState(5);
  const [selected, setSelected] = useState<string | null>(null);
  const [netLoss, setNetLoss] = useState(20);

  const standings = useMemo(() => snapshot.data?.standings ?? [], [snapshot.data]);
  const drivers = snapshot.data?.drivers ?? [];
  const order = useMemo(() => standings.map((row) => row.Driver), [standings]);

  // Default focus: the leader, until the viewer picks someone.
  useEffect(() => {
    if (!selected && order.length > 0) setSelected(order[0]);
  }, [order, selected]);

  // Telemetry compares the focused car with the one ahead of it.
  const compare = useMemo(() => {
    if (!selected) return [];
    const index = order.indexOf(selected);
    const rival = index > 0 ? order[index - 1] : order[index + 1];
    return rival ? [selected, rival] : [selected];
  }, [order, selected]);

  const telemetry = useLiveTelemetry(active, compare);
  const positions = useLivePositions(active);
  const strategy = useLiveStrategy(active, selected, netLoss);
  const tokenSet = Boolean(status.data?.token.set && !status.data.token.expired);

  if (status.isError) {
    return (
      <p className="rounded-3xl border border-red-400/20 bg-red-500/[0.06] p-6 text-sm text-red-200">
        Could not reach the backend: {(status.error as Error).message}. Start it with{" "}
        <code className="text-red-100">uvicorn main:app --port 8000</code> in backend/.
      </p>
    );
  }
  if (status.data && !status.data.enabled) {
    return (
      <p className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/70">
        Live timing is off on this backend. Add <code>F1_LIVE_ENABLED=1</code> to backend/.env on your
        own machine and restart it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/5 bg-black/40 px-5 py-3">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]",
            status.data?.mode === "live" ? "bg-red-500/15 text-red-200" : "bg-white/5 text-white/60"
          )}
        >
          {status.data?.mode === "live" ? "Live" : status.data?.mode === "replay" ? "Replay" : "Off"}
        </span>
        <span className="text-xs text-white/55">{status.data?.text ?? "Connecting to the backend…"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {status.data ? <TokenPill status={status.data} /> : null}
          <button
            type="button"
            onClick={() => start.mutate({ mode: "live" })}
            className="rounded-full bg-red-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-400"
          >
            Go live
          </button>
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white"
            aria-label="Replay speed"
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value} className="bg-[#0a0a0c]">
                {value}x
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => start.mutate({ mode: "replay", speed })}
            className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-white/80 hover:bg-white/5"
          >
            Replay São Paulo 2026
          </button>
          <button
            type="button"
            onClick={() => stop.mutate()}
            className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-white/60 hover:bg-white/5"
          >
            Stop
          </button>
        </div>
      </div>
      {start.error ? (
        <p className="text-sm text-red-300">{(start.error as Error).message}</p>
      ) : null}

      {!active ? (
        <p className="rounded-3xl border border-white/5 bg-black/40 p-8 text-center text-sm text-white/55">
          Go live during a session, or replay the recorded 2026 São Paulo race (laps 34–57) to try the page.
        </p>
      ) : snapshot.data ? (
        <>
          <SessionHeader session={snapshot.data.session} />
          <div className="grid gap-5 lg:gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <LiveTower
              standings={standings}
              drivers={drivers}
              tyres={snapshot.data.tyres}
              selected={selected}
              compare={compare}
              onSelect={setSelected}
            />
            <StrategyCard
              data={strategy.data}
              drivers={drivers}
              order={order}
              driver={selected}
              netLoss={netLoss}
              onDriver={setSelected}
              onNetLoss={setNetLoss}
              isFetching={strategy.isFetching}
              error={strategy.error as Error | null}
            />
          </div>
          <div className="grid gap-5 lg:gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <LiveTelemetryCard data={telemetry.data} drivers={drivers} codes={compare} tokenSet={tokenSet} />
            <div className="flex flex-col gap-5 lg:gap-6">
              <TrackMapCard data={positions.data} drivers={drivers} selected={selected} tokenSet={tokenSet} />
              <RaceControlCard messages={snapshot.data.race_control} />
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-white/55">Waiting for the first timing update…</p>
      )}
    </div>
  );
}
