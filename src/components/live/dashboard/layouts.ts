// The one-screen grid: 12 columns x 16 rows, sized to the window, so a layout
// always fits without scrolling. Pure functions, unit-tested.

export const COLS = 12;
export const ROWS = 16;

export type WidgetId =
  | "tower"
  | "strategy"
  | "focus"
  | "telemetry"
  | "map"
  | "gaps"
  | "tyres"
  | "raceControl"
  | "weather"
  | "pace";

export interface WidgetSpec {
  id: WidgetId;
  title: string;
  description: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
}

export const WIDGETS: Record<WidgetId, WidgetSpec> = {
  tower: { id: "tower", title: "Timing tower", description: "Order, gaps, tyres", defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 } },
  strategy: { id: "strategy", title: "Pit rejoin", description: "Where the focused car rejoins if it pits now", defaultSize: { w: 5, h: 10 }, minSize: { w: 3, h: 6 } },
  focus: { id: "focus", title: "Driver focus", description: "The focused car's gaps, tyre and trend", defaultSize: { w: 3, h: 7 }, minSize: { w: 2, h: 4 } },
  telemetry: { id: "telemetry", title: "Telemetry", description: "Speed, throttle, brake vs the car ahead", defaultSize: { w: 6, h: 8 }, minSize: { w: 3, h: 4 } },
  map: { id: "map", title: "Track map", description: "Car positions", defaultSize: { w: 4, h: 8 }, minSize: { w: 2, h: 4 } },
  gaps: { id: "gaps", title: "Gap chart", description: "Gap to the leader over time", defaultSize: { w: 4, h: 7 }, minSize: { w: 3, h: 4 } },
  tyres: { id: "tyres", title: "Tyre stints", description: "Every car's stints and compounds", defaultSize: { w: 5, h: 7 }, minSize: { w: 3, h: 4 } },
  raceControl: { id: "raceControl", title: "Race control", description: "Flags, penalties, messages", defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 3 } },
  pace: { id: "pace", title: "Race pace", description: "Underlying pace, tyre wear and fuel effect from clean laps", defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 4 } },
  weather: { id: "weather", title: "Weather", description: "Air, track, wind, rain", defaultSize: { w: 3, h: 4 }, minSize: { w: 2, h: 3 } },
};

export interface Item {
  i: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Layout = Item[];

export const PRESETS: Record<string, Layout> = {
  Race: [
    { i: "tower", x: 0, y: 0, w: 4, h: 8 },
    { i: "telemetry", x: 0, y: 8, w: 4, h: 8 },
    { i: "gaps", x: 4, y: 0, w: 4, h: 8 },
    { i: "map", x: 8, y: 0, w: 4, h: 8 },
    { i: "focus", x: 4, y: 8, w: 4, h: 8 },
    { i: "raceControl", x: 8, y: 8, w: 4, h: 8 },
  ],
  Strategy: [
    { i: "tower", x: 0, y: 0, w: 4, h: 8 },
    { i: "telemetry", x: 0, y: 8, w: 4, h: 8 },
    { i: "strategy", x: 4, y: 0, w: 8, h: 10 },
    { i: "tyres", x: 4, y: 10, w: 5, h: 6 },
    { i: "weather", x: 9, y: 10, w: 3, h: 6 },
  ],
  "Driver focus": [
    { i: "focus", x: 0, y: 0, w: 3, h: 8 },
    { i: "tower", x: 0, y: 8, w: 3, h: 8 },
    { i: "telemetry", x: 3, y: 0, w: 6, h: 10 },
    { i: "gaps", x: 3, y: 10, w: 6, h: 6 },
    { i: "map", x: 9, y: 0, w: 3, h: 7 },
    { i: "raceControl", x: 9, y: 7, w: 3, h: 9 },
  ],
};

export const DEFAULT_PRESET = "Race";

function overlaps(a: Item, b: Item): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The first top-left spot where a ``w`` x ``h`` item fits, or null when the screen is full. */
export function findSpot(layout: Layout, w: number, h: number): { x: number; y: number } | null {
  for (let y = 0; y + h <= ROWS; y += 1) {
    for (let x = 0; x + w <= COLS; x += 1) {
      const probe = { i: "tower" as WidgetId, x, y, w, h };
      if (!layout.some((item) => overlaps(item, probe))) return { x, y };
    }
  }
  return null;
}

/**
 * Add a widget at its default size, shrinking towards its minimum until it fits.
 * Returns null when there is no room: the viewer must make space first.
 */
export function addWidget(layout: Layout, id: WidgetId): Layout | null {
  if (layout.some((item) => item.i === id)) return layout;
  const spec = WIDGETS[id];
  for (let h = spec.defaultSize.h; h >= spec.minSize.h; h -= 1) {
    for (let w = spec.defaultSize.w; w >= spec.minSize.w; w -= 1) {
      const spot = findSpot(layout, w, h);
      if (spot) return [...layout, { i: id, ...spot, w, h }];
    }
  }
  return null;
}

export function removeWidget(layout: Layout, id: WidgetId): Layout {
  return layout.filter((item) => item.i !== id);
}

/**
 * A layout from storage made safe: known widgets only, once each, sizes within
 * the widget's minimum and the screen, nothing overlapping or off-screen.
 * Anything that cannot be placed is dropped rather than pushed below the fold.
 */
export function sanitize(raw: unknown): Layout {
  if (!Array.isArray(raw)) return [];
  const out: Layout = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { i, x, y, w, h } = entry as Record<string, unknown>;
    if (typeof i !== "string" || !(i in WIDGETS) || out.some((item) => item.i === i)) continue;
    const spec = WIDGETS[i as WidgetId];
    const nums = [x, y, w, h].map((v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN));
    if (nums.some(Number.isNaN)) continue;
    const width = Math.min(Math.max(nums[2], spec.minSize.w), COLS);
    const height = Math.min(Math.max(nums[3], spec.minSize.h), ROWS);
    const item: Item = {
      i: i as WidgetId,
      x: Math.min(Math.max(nums[0], 0), COLS - width),
      y: Math.min(Math.max(nums[1], 0), ROWS - height),
      w: width,
      h: height,
    };
    if (out.some((other) => overlaps(other, item))) {
      const spot = findSpot(out, width, height);
      if (!spot) continue;
      item.x = spot.x;
      item.y = spot.y;
    }
    out.push(item);
  }
  return out;
}

// --- browser storage: one current layout plus named ones -------------------

const STORAGE_KEY = "apex.live.layouts.v1";

export interface StoredLayouts {
  current: Layout;
  saved: Record<string, Layout>;
}

export function loadLayouts(storage: Pick<Storage, "getItem"> | null): StoredLayouts {
  const fallback = { current: PRESETS[DEFAULT_PRESET], saved: {} };
  if (!storage) return fallback;
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return fallback;
    const current = sanitize(parsed.current);
    const saved: Record<string, Layout> = {};
    for (const [name, layout] of Object.entries(parsed.saved ?? {})) {
      const clean = sanitize(layout);
      if (clean.length) saved[name] = clean;
    }
    return { current: current.length ? current : fallback.current, saved };
  } catch {
    return fallback;
  }
}

export function storeLayouts(storage: Pick<Storage, "setItem"> | null, layouts: StoredLayouts): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // private mode or full storage: the layout just is not remembered
  }
}
