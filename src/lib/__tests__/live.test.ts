import { gapTrend, type GapSeries } from "../live";

// Two minutes of samples every 10 s, with an 80 s lap.
const t = Array.from({ length: 13 }, (_, i) => -120 + i * 10);
const series: GapSeries = {
  t,
  lap: t.map(() => 30),
  gaps: {
    A: t.map(() => 5),
    B: t.map(() => 8),
  },
};

describe("gapTrend", () => {
  it("is negative when the car behind is closing, in seconds per lap", () => {
    const closing: GapSeries = { ...series, gaps: { A: t.map(() => 5), B: t.map((s) => 8 - ((s + 120) / 80) * 0.5) } };

    expect(gapTrend(closing, "A", "B", 120, 80)).toBeCloseTo(-0.5, 5);
  });

  it("is positive when the gap grows", () => {
    const growing: GapSeries = { ...series, gaps: { A: t.map(() => 5), B: t.map((s) => 8 + ((s + 120) / 80) * 0.3) } };

    expect(gapTrend(growing, "A", "B", 120, 80)).toBeCloseTo(0.3, 5);
  });

  it("only looks back over the window", () => {
    const late: GapSeries = {
      ...series,
      gaps: { A: t.map(() => 5), B: t.map((s) => (s < -40 ? 20 : 8 - ((s + 40) / 80) * 0.4)) },
    };

    expect(gapTrend(late, "A", "B", 40, 80)).toBeCloseTo(-0.4, 5);
  });

  it("is null without a lap time, a car, or enough history", () => {
    expect(gapTrend(series, "A", "B", 120, null)).toBeNull();
    expect(gapTrend(series, "A", "Z", 120, 80)).toBeNull();
    expect(gapTrend({ t: [0], lap: [1], gaps: { A: [0], B: [1] } }, "A", "B", 120, 80)).toBeNull();
    expect(gapTrend(series, "A", "B", 5, 80)).toBeNull(); // under half a lap of history
  });

  it("is null when a car has no gap at either end (in the pit lane)", () => {
    const pitted: GapSeries = { ...series, gaps: { A: t.map(() => 5), B: [...t.slice(0, -1).map(() => 8), null] } };

    expect(gapTrend(pitted, "A", "B", 120, 80)).toBeNull();
  });
});
