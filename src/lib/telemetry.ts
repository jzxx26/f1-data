import type { LapTelemetryPoint } from "./openf1";

/** Numeric, interpolatable fields on a telemetry point. */
type NumericField = "time" | "speed" | "x" | "y" | "distance";

/**
 * Linearly interpolate a field at each query distance.
 * `points` must be sorted ascending by distance and `queries` ascending too.
 */
export function interpolateField(
  points: LapTelemetryPoint[],
  queries: number[],
  field: NumericField
): number[] {
  const out: number[] = [];
  if (points.length === 0) return queries.map(() => NaN);

  const first = points[0];
  const last = points[points.length - 1];
  let j = 0;

  for (const q of queries) {
    if (q <= first.distance) {
      out.push(Number(first[field]));
      continue;
    }
    if (q >= last.distance) {
      out.push(Number(last[field]));
      continue;
    }
    while (j < points.length - 1 && points[j + 1].distance < q) j += 1;
    const a = points[j];
    const b = points[j + 1];
    const span = b.distance - a.distance;
    const f = span > 0 ? (q - a.distance) / span : 0;
    const av = Number(a[field]);
    const bv = Number(b[field]);
    out.push(av + (bv - av) * f);
  }
  return out;
}

export interface MiniSector {
  index: number;
  startDist: number;
  endDist: number;
  timeA: number;
  timeB: number;
  /** Positive = B took longer than A (A faster in this sector). */
  delta: number;
  winner: "A" | "B";
}

/**
 * Split both laps into `count` equal-distance mini-sectors and compare the
 * time each driver spent in every sector.
 */
export function computeMiniSectors(
  a: LapTelemetryPoint[],
  b: LapTelemetryPoint[],
  count = 24
): { sectors: MiniSector[]; maxDistance: number } {
  if (a.length === 0 || b.length === 0) return { sectors: [], maxDistance: 0 };

  const maxDistance = Math.min(
    a[a.length - 1].distance,
    b[b.length - 1].distance
  );
  if (!(maxDistance > 0)) return { sectors: [], maxDistance: 0 };

  const bounds = Array.from(
    { length: count + 1 },
    (_, i) => (maxDistance * i) / count
  );
  const timeA = interpolateField(a, bounds, "time");
  const timeB = interpolateField(b, bounds, "time");

  const sectors: MiniSector[] = [];
  for (let i = 0; i < count; i += 1) {
    const tA = timeA[i + 1] - timeA[i];
    const tB = timeB[i + 1] - timeB[i];
    const delta = tB - tA;
    sectors.push({
      index: i,
      startDist: bounds[i],
      endDist: bounds[i + 1],
      timeA: tA,
      timeB: tB,
      delta,
      winner: delta >= 0 ? "A" : "B",
    });
  }
  return { sectors, maxDistance };
}
