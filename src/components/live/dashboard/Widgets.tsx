"use client";

import { LiveTelemetryCard } from "@/components/live/LiveTelemetryCard";
import { LiveTower } from "@/components/live/LiveTower";
import { RaceControlCard } from "@/components/live/RaceControlCard";
import { StrategyCard } from "@/components/live/StrategyCard";
import { TrackMapCard } from "@/components/live/TrackMapCard";
import { DriverFocus } from "@/components/live/widgets/DriverFocus";
import { GapChart } from "@/components/live/widgets/GapChart";
import { TyreStints } from "@/components/live/widgets/TyreStints";
import { Weather } from "@/components/live/widgets/Weather";
import { cn } from "@/lib/utils";
import { WIDGETS, type WidgetId } from "./layouts";
import { useLiveData } from "./LiveData";

export function WidgetBody({ id }: { id: WidgetId }) {
  const data = useLiveData();
  const snapshot = data.snapshot;
  if (!snapshot) return <p className="text-xs text-white/50">Waiting for timing…</p>;
  switch (id) {
    case "tower":
      return (
        <LiveTower
          standings={snapshot.standings}
          drivers={snapshot.drivers}
          tyres={snapshot.tyres}
          selected={data.focus}
          compare={data.compare}
          onSelect={data.setFocus}
        />
      );
    case "strategy":
      return (
        <StrategyCard
          data={data.strategy.data}
          drivers={snapshot.drivers}
          order={data.order}
          driver={data.focus}
          netLoss={data.netLoss}
          onDriver={data.setFocus}
          onNetLoss={data.setNetLoss}
          isFetching={data.strategy.fetching}
          error={data.strategy.error}
        />
      );
    case "telemetry":
      return <LiveTelemetryCard data={data.telemetry} drivers={snapshot.drivers} codes={data.compare} tokenSet={data.tokenSet} />;
    case "map":
      return <TrackMapCard data={data.positions} drivers={snapshot.drivers} selected={data.focus} tokenSet={data.tokenSet} />;
    case "raceControl":
      return <RaceControlCard messages={snapshot.race_control} />;
    case "focus":
      return <DriverFocus />;
    case "gaps":
      return <GapChart />;
    case "tyres":
      return <TyreStints />;
    case "weather":
      return <Weather />;
  }
}

/** The card around every widget: title bar (drag handle while editing) and a body that scrolls on its own. */
export function WidgetFrame({ id, editing, onRemove }: { id: WidgetId; editing: boolean; onRemove: () => void }) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-black/40 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header
        className={cn(
          "widget-handle flex shrink-0 items-center justify-between border-b border-white/5 px-3 py-1",
          editing && "cursor-move bg-white/[0.03]"
        )}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/55">{WIDGETS[id].title}</span>
        {editing ? (
          <button
            type="button"
            onClick={onRemove}
            onMouseDown={(event) => event.stopPropagation()}
            className="widget-remove rounded-full px-2 text-[10px] text-white/50 hover:bg-white/10 hover:text-white"
            aria-label={`Remove ${WIDGETS[id].title}`}
          >
            Remove
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 p-2">
        <WidgetBody id={id} />
      </div>
    </section>
  );
}
