"use client";

import { useLiveData } from "@/components/live/dashboard/LiveData";
import { TyreBadge } from "@/components/live/LiveTower";
import { gapTrend, placeText, teamColour } from "@/lib/live";
import { cn } from "@/lib/utils";

// Trend over the last three minutes of gap history.
const TREND_WINDOW_S = 180;

function Trend({ value, closingIsGood }: { value: number | null; closingIsGood: boolean }) {
  if (value === null) return <span className="text-white/35">no trend yet</span>;
  if (Math.abs(value) < 0.05) return <span className="text-white/55">steady</span>;
  const closing = value < 0;
  const good = closing === closingIsGood;
  return (
    <span className={good ? "text-emerald-300" : "text-amber-200"}>
      {closing ? "closing" : "growing"} {Math.abs(value).toFixed(2)} s/lap
    </span>
  );
}

export function DriverFocus() {
  const { snapshot, focus, order, gaps, strategy } = useLiveData();
  if (!snapshot || !focus) return <p className="text-xs text-white/50">Pick a driver in the tower.</p>;
  const row = snapshot.standings.find((r) => r.Driver === focus);
  if (!row) return <p className="text-xs text-white/50">{focus} is not in the timing data.</p>;
  const index = order.indexOf(focus);
  const ahead = index > 0 ? snapshot.standings[index - 1] : undefined;
  const behind = snapshot.standings[index + 1];
  const lap = row.LastSeconds ?? row.BestSeconds ?? null;
  const prediction = strategy.data?.driver === focus ? strategy.data.prediction : undefined;

  return (
    <div className="@container flex h-full flex-col gap-2 overflow-auto text-xs">
      <div className="flex items-center gap-2">
        <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: teamColour(snapshot.drivers, focus) }} />
        <div className="text-2xl font-semibold tabular-nums text-white">P{row.Position}</div>
        <div>
          <div className="text-sm font-semibold text-white">{focus}</div>
          <div className="text-[10px] text-white/45">
            {snapshot.drivers.find((d) => d.name_acronym === focus)?.team_name}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <TyreBadge tyre={snapshot.tyres[focus]} />
          {row.Status === "IN PIT" ? <span className="rounded-full bg-white/10 px-2 text-[10px] text-white/80">PIT</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 @md:grid-cols-4">
        {[
          ["Gap", row.Gap],
          ["Last", row.LastLap],
          ["Best", row.BestLap],
          ["Stops", row.Pits ?? "–"],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1">
            <div className="text-[9px] uppercase tracking-[0.2em] text-white/40">{label}</div>
            <div
              className={cn(
                "tabular-nums text-white",
                label === "Last" && row.LastFlag === "sb" && "text-fuchsia-300",
                label === "Last" && row.LastFlag === "pb" && "text-emerald-300"
              )}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1">
          <span className="text-white/55">Ahead {ahead ? <b className="text-white">{ahead.Driver}</b> : "–"}</span>
          <span className="tabular-nums text-white">{ahead ? row.Interval : "Leading"}</span>
          {ahead ? <Trend value={gapTrend(gaps, ahead.Driver, focus, TREND_WINDOW_S, lap)} closingIsGood /> : <span />}
        </div>
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1">
          <span className="text-white/55">Behind {behind ? <b className="text-white">{behind.Driver}</b> : "–"}</span>
          <span className="tabular-nums text-white">{behind ? behind.Interval : "Last"}</span>
          {behind ? <Trend value={gapTrend(gaps, focus, behind.Driver, TREND_WINDOW_S, lap)} closingIsGood={false} /> : <span />}
        </div>
      </div>

      <div className="rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1 text-white/60">
        Pit now:{" "}
        {prediction && (prediction.status === "ok" || prediction.status === "uncertain") ? (
          <b className="text-white">{placeText(prediction.position, prediction.position_range)}</b>
        ) : (
          <span className="text-white/40">{prediction?.reason ?? "–"}</span>
        )}
        {prediction ? <span className="text-white/40"> at {prediction.net_pit_loss.toFixed(1)} s net (assumed)</span> : null}
      </div>
    </div>
  );
}
