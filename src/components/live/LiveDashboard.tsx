"use client";

import {
  addWidget,
  COLS,
  DEFAULT_PRESET,
  loadLayouts,
  PRESETS,
  removeWidget,
  ROWS,
  sanitize,
  storeLayouts,
  WIDGETS,
  type Layout,
  type StoredLayouts,
  type WidgetId,
} from "@/components/live/dashboard/layouts";
import { LiveDataProvider, useLiveData } from "@/components/live/dashboard/LiveData";
import { LiveTopBar } from "@/components/live/dashboard/LiveTopBar";
import { WidgetFrame } from "@/components/live/dashboard/Widgets";
import { useCallback, useEffect, useState, type RefObject } from "react";
import ReactGridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";

const MARGIN = 8;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function sameLayout(a: Layout, b: Layout): boolean {
  if (a.length !== b.length) return false;
  return a.every((item) => {
    const other = b.find((o) => o.i === item.i);
    return other && other.x === item.x && other.y === item.y && other.w === item.w && other.h === item.h;
  });
}

function Grid({
  layout,
  editing,
  onChange,
  onRemove,
}: {
  layout: Layout;
  editing: boolean;
  onChange: (layout: Layout) => void;
  onRemove: (id: WidgetId) => void;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, [containerRef]);

  // Rows stretch to the window, so the grid always ends at the bottom of the screen.
  const rowHeight = Math.max(12, (height - MARGIN * (ROWS - 1)) / ROWS);

  return (
    // react-grid-layout types its ref for React 19; under React 18 types it is the same object.
    <div ref={containerRef as RefObject<HTMLDivElement>} className="min-h-0 flex-1 overflow-hidden">
      {mounted && height > 0 ? (
        <ReactGridLayout
          width={width}
          layout={layout.map((item) => ({ ...item, minW: WIDGETS[item.i].minSize.w, minH: WIDGETS[item.i].minSize.h }))}
          gridConfig={{ cols: COLS, rowHeight, margin: [MARGIN, MARGIN], containerPadding: [0, 0], maxRows: ROWS }}
          dragConfig={{ enabled: editing, handle: ".widget-handle", cancel: ".widget-remove", bounded: true }}
          resizeConfig={{ enabled: editing, handles: ["se", "e", "s"] }}
          compactor={verticalCompactor}
          onLayoutChange={(next) => {
            const items = next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })) as Layout;
            // A move that would push a panel below the screen is not taken.
            if (items.some((item) => item.y + item.h > ROWS)) return;
            const clean = sanitize(items);
            if (clean.length === layout.length && !sameLayout(clean, layout)) onChange(clean);
          }}
        >
          {layout.map((item) => (
            <div key={item.i}>
              <WidgetFrame id={item.i} editing={editing} onRemove={() => onRemove(item.i)} />
            </div>
          ))}
        </ReactGridLayout>
      ) : null}
    </div>
  );
}

function Screen({
  stored,
  update,
}: {
  stored: StoredLayouts;
  update: (next: StoredLayouts) => void;
}) {
  const { status, statusError } = useLiveData();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const layout = stored.current;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (statusError) {
    return (
      <p className="rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-6 text-sm text-red-200">
        Could not reach the backend: {statusError.message}. Start it in backend/ with{" "}
        <code className="text-red-100">.venv/bin/python -m uvicorn main:app --port 8000</code>.
      </p>
    );
  }
  if (status && !status.enabled) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/70">
        Live timing is off on this backend. Add <code>F1_LIVE_ENABLED=1</code> to backend/.env and restart it.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <LiveTopBar
        layout={layout}
        saved={stored.saved}
        editing={editing}
        notice={notice}
        onEditing={setEditing}
        onApply={(next) => update({ ...stored, current: next })}
        onAdd={(id) => {
          const next = addWidget(layout, id);
          if (next) update({ ...stored, current: next });
          else setNotice(`No room for ${WIDGETS[id].title}: shrink or remove a panel first.`);
        }}
        onSave={(name) => {
          update({ ...stored, saved: { ...stored.saved, [name]: layout } });
          setNotice(`Saved layout “${name}”.`);
        }}
        onDelete={(name) => {
          const rest = { ...stored.saved };
          delete rest[name];
          update({ ...stored, saved: rest });
        }}
      />
      <Grid
        layout={layout}
        editing={editing}
        onChange={(next) => update({ ...stored, current: next })}
        onRemove={(id) => update({ ...stored, current: removeWidget(layout, id) })}
      />
    </div>
  );
}

/** The one-screen live dashboard: panels you add, drag and resize, remembered in this browser. */
export function LiveDashboard() {
  const [stored, setStored] = useState<StoredLayouts>({ current: PRESETS[DEFAULT_PRESET], saved: {} });

  useEffect(() => {
    setStored(loadLayouts(browserStorage()));
  }, []);

  const update = useCallback((next: StoredLayouts) => {
    setStored(next);
    storeLayouts(browserStorage(), next);
  }, []);

  return (
    <LiveDataProvider widgets={stored.current.map((item) => item.i)}>
      <Screen stored={stored} update={update} />
    </LiveDataProvider>
  );
}
