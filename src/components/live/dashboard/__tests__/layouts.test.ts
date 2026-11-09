import {
  addWidget,
  COLS,
  findSpot,
  loadLayouts,
  PRESETS,
  removeWidget,
  ROWS,
  sanitize,
  storeLayouts,
  WIDGETS,
  type Layout,
} from "../layouts";

function fitsAndDoesNotOverlap(layout: Layout) {
  const cells = new Set<string>();
  for (const item of layout) {
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.y).toBeGreaterThanOrEqual(0);
    expect(item.x + item.w).toBeLessThanOrEqual(COLS);
    expect(item.y + item.h).toBeLessThanOrEqual(ROWS);
    expect(item.w).toBeGreaterThanOrEqual(WIDGETS[item.i].minSize.w);
    expect(item.h).toBeGreaterThanOrEqual(WIDGETS[item.i].minSize.h);
    for (let x = item.x; x < item.x + item.w; x += 1) {
      for (let y = item.y; y < item.y + item.h; y += 1) {
        const key = `${x},${y}`;
        expect(cells.has(key)).toBe(false);
        cells.add(key);
      }
    }
  }
}

describe("presets", () => {
  it.each(Object.entries(PRESETS))("%s fits one screen without overlaps", (_name, layout) => {
    fitsAndDoesNotOverlap(layout);
  });
});

describe("addWidget", () => {
  it("places a widget in the first free spot", () => {
    const layout = addWidget(PRESETS.Strategy.filter((i) => i.i !== "weather"), "weather");

    expect(layout?.find((i) => i.i === "weather")).toEqual({ i: "weather", x: 9, y: 10, w: 3, h: 4 });
    fitsAndDoesNotOverlap(layout!);
  });

  it("shrinks towards the minimum when the default size does not fit", () => {
    // Without weather the Strategy preset leaves a 3 x 6 hole; focus defaults to 3 x 7.
    const layout = addWidget(removeWidget(PRESETS.Strategy, "weather"), "focus");

    expect(layout?.find((i) => i.i === "focus")).toEqual({ i: "focus", x: 9, y: 10, w: 3, h: 6 });
    fitsAndDoesNotOverlap(layout!);
  });

  it("returns null when the screen is full", () => {
    expect(addWidget(PRESETS.Strategy, "focus")).toBeNull();

    const full: Layout = [{ i: "tower", x: 0, y: 0, w: COLS, h: ROWS }];

    expect(addWidget(full, "weather")).toBeNull();
  });

  it("does not add a widget twice", () => {
    expect(addWidget(PRESETS.Race, "tower")).toBe(PRESETS.Race);
  });
});

describe("sanitize", () => {
  it("drops unknown widgets, duplicates and broken entries", () => {
    const layout = sanitize([
      { i: "tower", x: 0, y: 0, w: 4, h: 16 },
      { i: "tower", x: 4, y: 0, w: 4, h: 4 },
      { i: "ads", x: 4, y: 0, w: 4, h: 4 },
      { i: "map", x: "a", y: 0, w: 4, h: 4 },
      null,
    ]);

    expect(layout.map((i) => i.i)).toEqual(["tower"]);
  });

  it("clamps sizes to the screen and the widget minimum", () => {
    const [item] = sanitize([{ i: "map", x: 11, y: 15, w: 1, h: 40 }]);

    expect(item).toEqual({ i: "map", x: 10, y: 0, w: 2, h: 16 });
  });

  it("moves an overlapping widget instead of stacking it", () => {
    const layout = sanitize([
      { i: "tower", x: 0, y: 0, w: 4, h: 16 },
      { i: "map", x: 2, y: 2, w: 4, h: 4 },
    ]);

    fitsAndDoesNotOverlap(layout);
    expect(layout).toHaveLength(2);
  });

  it("is not an array: nothing", () => {
    expect(sanitize({ i: "tower" })).toEqual([]);
  });
});

describe("storage", () => {
  it("round-trips the current and saved layouts", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };

    storeLayouts(storage, { current: PRESETS.Strategy, saved: { Mine: PRESETS["Driver focus"] } });

    expect(loadLayouts(storage)).toEqual({ current: PRESETS.Strategy, saved: { Mine: PRESETS["Driver focus"] } });
  });

  it("falls back to the default preset on corrupt or missing data", () => {
    expect(loadLayouts({ getItem: () => "{not json" }).current).toEqual(PRESETS.Race);
    expect(loadLayouts(null).current).toEqual(PRESETS.Race);
  });

  it("survives storage that throws", () => {
    expect(() =>
      storeLayouts({ setItem: () => { throw new Error("quota"); } }, { current: [], saved: {} })
    ).not.toThrow();
  });

  it("finds no spot on a full screen", () => {
    expect(findSpot([{ i: "tower", x: 0, y: 0, w: COLS, h: ROWS }], 1, 1)).toBeNull();
  });

  it("removes a widget", () => {
    expect(removeWidget(PRESETS.Race, "map").some((i) => i.i === "map")).toBe(false);
  });
});

describe("tower and telemetry share the left column", () => {
  it.each(["Race", "Strategy"])("%s: half-height tower over the telemetry", (name) => {
    const tower = PRESETS[name].find((item) => item.i === "tower");
    const telemetry = PRESETS[name].find((item) => item.i === "telemetry");
    expect(tower).toMatchObject({ x: 0, y: 0, h: ROWS / 2 });
    expect(telemetry).toMatchObject({ x: 0, y: ROWS / 2, w: tower!.w, h: ROWS / 2 });
    expect(sanitize(PRESETS[name])).toEqual(PRESETS[name]);
  });
});
