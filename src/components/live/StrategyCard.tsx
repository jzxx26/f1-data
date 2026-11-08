"use client";

import { getTyreColor } from "@/lib/colors";
import {
  placeText,
  teamColour,
  type LiveDriver,
  type StrategyResponse,
} from "@/lib/live";
import { cn } from "@/lib/utils";

interface StrategyCardProps {
  data: StrategyResponse | undefined;
  drivers: LiveDriver[];
  order: string[];
  driver: string | null;
  netLoss: number;
  onDriver: (code: string) => void;
  onNetLoss: (seconds: number) => void;
  isFetching?: boolean;
  error?: Error | null;
}

const WINDOW = 4;

function signed(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined) return "–";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function marginLines(data: StrategyResponse): string[] {
  const p = data.prediction;
  if (p.position === null) return [];
  const lines: string[] = [];
  if (p.loss_to_drop !== null && p.drop_to) {
    lines.push(
      `${p.loss_to_drop.toFixed(3)} s more net loss and ${p.drop_to} is ahead (a tie goes to the car already there).`
    );
  } else if (p.behind.length === 0) {
    lines.push(`Nobody behind: P${p.position} whatever the loss.`);
  } else {
    lines.push("The car behind has no timed gap, so the margin to losing a place is unknown.");
  }
  if (p.loss_to_gain !== null && p.gain_on) {
    lines.push(
      `More than ${p.loss_to_gain.toFixed(3)} s less net loss passes ${p.gain_on} for P${p.position - 1}.`
    );
  } else if (p.position === 1) {
    lines.push("Leads after the stop.");
  } else if (p.ahead[0]?.gap === null) {
    lines.push("The car ahead has no timed gap, so the margin to gaining a place is unknown.");
  } else if (p.ahead[0]) {
    lines.push(`Even a zero-second stop does not pass ${p.ahead[0].driver}.`);
  }
  return lines;
}

export function StrategyCard({
  data,
  drivers,
  order,
  driver,
  netLoss,
  onDriver,
  onNetLoss,
  isFetching,
  error,
}: StrategyCardProps) {
  const prediction = data?.prediction;
  const summary = data?.summary;
  const [low, high] = data?.net_loss.range ?? [15, 35];
  const hasPlace = prediction && (prediction.status === "ok" || prediction.status === "uncertain");
  const rows = prediction?.projected_order ?? [];
  const me = rows.findIndex((row) => row.driver === prediction?.driver);
  const shown = me >= 0 ? rows.slice(Math.max(me - WINDOW, 0), me + WINDOW + 1) : [];
  const currentPosition = new Map(order.map((code, index) => [code, index + 1]));

  return (
    <section className="flex flex-col rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            Strategy
          </p>
          <h2 className="text-lg font-semibold text-white">If they pitted now</h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60">
          {isFetching ? "Updating…" : "Estimate"}
        </span>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs text-white/60">
            Driver
            <select
              value={driver ?? ""}
              onChange={(event) => onDriver(event.target.value)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              {order.map((code, index) => (
                <option key={code} value={code} className="bg-[#0a0a0c]">
                  P{index + 1} {code}
                </option>
              ))}
            </select>
          </label>

          {summary ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm">
              <dt className="text-white/45">Driver</dt>
              <dd className="flex items-center gap-2 font-semibold text-white">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: teamColour(drivers, summary.driver) }}
                />
                {summary.driver}
                {summary.number ? <span className="text-white/40">#{summary.number}</span> : null}
              </dd>
              <dt className="text-white/45">Position</dt>
              <dd className="tabular-nums text-white">P{summary.position}</dd>
              <dt className="text-white/45">Tyre</dt>
              <dd className="flex items-center gap-2 text-white">
                {summary.compound && summary.compound !== "UNKNOWN" ? (
                  <>
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold"
                      style={{ borderColor: getTyreColor(summary.compound), color: getTyreColor(summary.compound) }}
                      title={summary.compound}
                    >
                      {summary.compound[0]}
                    </span>
                    <span className="tabular-nums">{summary.tyre_age ?? "–"} laps</span>
                    {summary.tyre_new === false ? <span className="text-white/40">used</span> : null}
                  </>
                ) : (
                  "–"
                )}
              </dd>
              <dt className="text-white/45">Stops</dt>
              <dd className="tabular-nums text-white">{summary.pits ?? "–"}</dd>
              <dt className="text-white/45">Car ahead</dt>
              <dd className="tabular-nums text-white">
                {summary.ahead ? `${summary.ahead} ${signed(summary.to_ahead)}` : "Nobody"}
              </dd>
              <dt className="text-white/45">Car behind</dt>
              <dd className="tabular-nums text-white">
                {summary.behind ? `${summary.behind} ${signed(summary.to_behind)}` : "Nobody"}
              </dd>
            </dl>
          ) : null}

          <div className="flex flex-col gap-2">
            <label htmlFor="net-loss" className="flex items-center justify-between text-xs text-white/60">
              <span>Estimated net pit loss (s)</span>
              <span className="tabular-nums text-sm font-semibold text-white">{netLoss.toFixed(1)}</span>
            </label>
            <input
              id="net-loss"
              type="range"
              min={low}
              max={high}
              step={0.5}
              value={netLoss}
              onChange={(event) => onNetLoss(Number(event.target.value))}
              className="accent-red-500"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => onNetLoss(data?.net_loss.default ?? 20)}
                className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/70 hover:bg-white/5"
              >
                Reset to {(data?.net_loss.default ?? 20).toFixed(1)} s
              </button>
              <span className="text-[11px] text-white/40">Scenarios ±2 s below</span>
            </div>
            <p className="rounded-xl border border-amber-300/15 bg-amber-400/[0.05] p-3 text-[11px] leading-relaxed text-amber-100/80">
              <span className="font-semibold uppercase tracking-[0.2em] text-amber-200/80">Assumption · </span>
              {data?.net_loss.note ??
                "Net pit loss is how much longer a stop takes than staying out. It is not measured; set it for the circuit."}
            </p>
            <p className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/55">
              <span className="font-semibold uppercase tracking-[0.2em] text-white/60">Observed · </span>
              {data?.observed_pit_lane.median != null
                ? `Median pit lane time ${data.observed_pit_lane.median.toFixed(1)} s over ${data.observed_pit_lane.stops} stops (entry to exit). Reference only, not used: a car that stays out also needs time to cover that stretch.`
                : `${data?.observed_pit_lane.stops ? `${data.observed_pit_lane.stops} stop(s) timed so far, 3 needed for a median.` : "No stops timed yet."} Counted from when the backend started the feed.`}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {error ? (
            <p className="rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-4 text-sm text-red-200">
              {error.message}
            </p>
          ) : null}
          {data?.stale ? (
            <p className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-3 text-sm text-amber-100">
              {data.stale}
            </p>
          ) : null}

          {prediction && hasPlace ? (
            <>
              <div className="grid grid-cols-4 gap-3">
                {[
                  ["Now", prediction.current_position ? `P${prediction.current_position}` : "–"],
                  ["After the stop", placeText(prediction.position, prediction.position_range)],
                  [
                    "Places",
                    prediction.places_lost === null
                      ? "–"
                      : prediction.places_lost === 0
                        ? "0"
                        : `${-prediction.places_lost > 0 ? "+" : ""}${-prediction.places_lost}`,
                  ],
                  ["Net loss", `${prediction.net_pit_loss.toFixed(1)} s`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">{label}</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</div>
                  </div>
                ))}
              </div>

              {data ? (
                <ul className="flex flex-col gap-1 text-xs text-white/60">
                  {marginLines(data).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-white/5">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.25em] text-white/45">
                    <tr>
                      <th className="px-3 py-2 text-left">Pos</th>
                      <th className="px-3 py-2 text-left">Driver</th>
                      <th className="px-3 py-2 text-left">Now</th>
                      <th className="px-3 py-2 text-right">Gap</th>
                      <th className="px-3 py-2 text-right">To {prediction.driver}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => {
                      const isMe = row.driver === prediction.driver;
                      const now = currentPosition.get(row.driver);
                      return (
                        <tr
                          key={row.driver}
                          className={cn(
                            "border-t border-white/5",
                            isMe ? "bg-red-500/[0.12] ring-1 ring-inset ring-red-400/50" : ""
                          )}
                        >
                          <td className="px-3 py-1.5 tabular-nums text-white/80">{row.position}</td>
                          <td className="px-3 py-1.5">
                            <span className="flex items-center gap-2 font-semibold text-white">
                              <span
                                aria-hidden
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: teamColour(drivers, row.driver) }}
                              />
                              {row.driver}
                              {!isMe && row.status === "IN PIT" ? (
                                <span className="rounded-full bg-white/10 px-2 text-[10px] text-white/70">PIT</span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 tabular-nums text-white/45">{now ? `P${now}` : "–"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-white/60">
                            {row.gap === null ? "–" : row.gap.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-white">
                            {isMe ? "PITS" : signed(row.delta)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-white/45">
                  Scenarios · not a confidence interval
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {data?.scenarios.map((scenario) => (
                    <div
                      key={scenario.net_pit_loss}
                      className={cn(
                        "rounded-2xl border p-3",
                        scenario.net_pit_loss === prediction.net_pit_loss
                          ? "border-white/20 bg-white/[0.05]"
                          : "border-white/5 bg-white/[0.02]"
                      )}
                    >
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">
                        {scenario.net_pit_loss.toFixed(1)} s net
                      </div>
                      <div className="mt-1 text-lg font-semibold tabular-nums text-white">
                        {placeText(scenario.position, scenario.position_range)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {[...prediction.warnings.filter((w) => w !== data?.stale), data?.net_loss.check]
                .filter((w): w is string => Boolean(w))
                .map((warning) => (
                  <p
                    key={warning}
                    className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-3 text-xs text-amber-100"
                  >
                    {warning}
                  </p>
                ))}
            </>
          ) : prediction ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
              {prediction.reason}.
            </p>
          ) : (
            <p className="text-sm text-white/50">Pick a driver.</p>
          )}

          {prediction ? (
            <p className="text-[11px] leading-relaxed text-white/35">
              An estimate, not a forecast. {prediction.assumptions.join(" ")} Safety car, VSC and red
              flag are not modelled.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
