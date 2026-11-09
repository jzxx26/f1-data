"use client";

import {
  useLiveGaps,
  useLivePace,
  useLivePositions,
  useLiveSnapshot,
  useLiveStatus,
  useLiveStrategy,
  useLiveTelemetry,
  usePitLossHistory,
} from "@/hooks/useLive";
import type {
  GapSeries,
  LivePositions,
  LiveSnapshot,
  LiveStatus,
  LiveTelemetry,
  PaceModel,
  PitLossHistory,
  StrategyResponse,
} from "@/lib/live";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { WidgetId } from "./layouts";

export interface LiveData {
  status: LiveStatus | undefined;
  statusError: Error | null;
  active: boolean;
  snapshot: LiveSnapshot | undefined;
  order: string[];
  focus: string | null;
  setFocus: (code: string) => void;
  /** The focused car and the one ahead (or behind, for the leader). */
  compare: string[];
  netLoss: number;
  setNetLoss: (seconds: number) => void;
  strategy: { data: StrategyResponse | undefined; error: Error | null; fetching: boolean };
  /** Net pit loss measured at this circuit in past races. */
  pitLossHistory: { data: PitLossHistory | undefined; loading: boolean };
  pace: PaceModel | undefined;
  telemetry: LiveTelemetry | undefined;
  positions: LivePositions | undefined;
  gaps: GapSeries | undefined;
  tokenSet: boolean;
}

const Context = createContext<LiveData | null>(null);

export function useLiveData(): LiveData {
  const value = useContext(Context);
  if (!value) throw new Error("useLiveData outside LiveDataProvider");
  return value;
}

/** One set of polls for the whole screen; a widget's data is fetched only while it is shown. */
export function LiveDataProvider({ widgets, children }: { widgets: WidgetId[]; children: ReactNode }) {
  const status = useLiveStatus();
  const active = Boolean(status.data?.enabled && status.data.mode !== "off");
  const snapshot = useLiveSnapshot(active);
  const [focus, setFocus] = useState<string | null>(null);
  const [netLoss, setNetLoss] = useState(20);

  const order = useMemo(() => (snapshot.data?.standings ?? []).map((row) => row.Driver), [snapshot.data]);
  useEffect(() => {
    if (order.length > 0 && (!focus || !order.includes(focus))) setFocus(order[0]);
  }, [order, focus]);

  const compare = useMemo(() => {
    if (!focus) return [];
    const index = order.indexOf(focus);
    const rival = index > 0 ? order[index - 1] : order[index + 1];
    return rival ? [focus, rival] : [focus];
  }, [order, focus]);

  const shown = new Set(widgets);
  const needsStrategy = shown.has("strategy") || shown.has("focus");
  const strategy = useLiveStrategy(active && needsStrategy, focus, netLoss);
  const session = snapshot.data?.session;
  const history = usePitLossHistory(active && shown.has("strategy"), session?.gp, session?.year);
  const pace = useLivePace(active && shown.has("pace"));
  const telemetry = useLiveTelemetry(active && shown.has("telemetry"), compare);
  const positions = useLivePositions(active && shown.has("map"));
  const gapDrivers = useMemo(() => {
    if (!focus) return [];
    const index = order.indexOf(focus);
    return order.slice(Math.max(index - 2, 0), index + 3);
  }, [order, focus]);
  const gaps = useLiveGaps(active && (shown.has("gaps") || shown.has("focus")), gapDrivers);

  const value: LiveData = {
    status: status.data,
    statusError: (status.error as Error | null) ?? null,
    active,
    snapshot: snapshot.data,
    order,
    focus,
    setFocus,
    compare,
    netLoss,
    setNetLoss,
    strategy: {
      data: strategy.data,
      error: (strategy.error as Error | null) ?? null,
      fetching: strategy.isFetching,
    },
    pitLossHistory: { data: history.data, loading: history.isLoading },
    pace: pace.data,
    telemetry: telemetry.data,
    positions: positions.data,
    gaps: gaps.data,
    tokenSet: Boolean(status.data?.token.set && !status.data.token.expired),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
