import type { Chase, Projection } from "@/lib/live";
import { render, screen } from "@testing-library/react";
import { chaseLine, NextLaps } from "../widgets/NextLaps";

// From the recorded São Paulo race, lap 56, RUS on 40-lap softs.
const ahead: Chase = {
  chaser: "RUS",
  leader: "ANT",
  gap: 1.858,
  per_lap: -1.373,
  projected: [{ lap: 57, gap: 3.231 }],
  mom_lap: null,
  level_lap: null,
};
const behind: Chase = {
  chaser: "PIA",
  leader: "RUS",
  gap: 9.833,
  per_lap: 1.098,
  projected: [{ lap: 57, gap: 8.735 }],
  mom_lap: 65,
  level_lap: 65,
};
const projection: Projection = {
  driver: "RUS",
  lap: 56,
  total_laps: 71,
  model_status: "ok",
  mom_range_s: 1,
  ahead,
  behind,
  pit_window: { laps_left: 15, net_loss: 21.5, options: [{ compound: "SOFT", best_lap: 57, gain_vs_stay: 4.26 }], stay_out_wins: false, reason: null },
};

describe("chaseLine", () => {
  it("reads from the focused car's side", () => {
    expect(chaseLine(ahead, "RUS", 1)).toBe("ANT ahead by 1.9 s, opening 1.37 s/lap");
    expect(chaseLine(behind, "RUS", 1)).toBe("PIA behind by 9.8 s, closing 1.10 s/lap · within 1 s on lap 65 · level on lap 65");
  });

  it("says when a car is already in range", () => {
    expect(chaseLine({ ...behind, gap: 0.6, mom_lap: 56 }, "RUS", 1)).toContain("already within 1 s");
  });
});

describe("NextLaps", () => {
  it("recommends the stop when it pays", () => {
    render(<NextLaps data={projection} focus="RUS" />);
    expect(screen.getByText(/Pit at the end of lap 57 for SOFT: 4\.3 s quicker/)).toBeInTheDocument();
  });

  it("says stay out with what the best stop would cost", () => {
    const window = { ...projection.pit_window!, options: [{ compound: "SOFT", best_lap: 60, gain_vs_stay: -16.44 }], stay_out_wins: true };
    render(<NextLaps data={{ ...projection, pit_window: window }} focus="RUS" />);
    expect(screen.getByText(/Stay out: the best stop \(S, lap 60\) still costs 16\.4 s/)).toBeInTheDocument();
  });

  it("waits for the pace model", () => {
    render(<NextLaps data={{ ...projection, model_status: "not_enough_laps", reason: "Needs 3 clean laps." }} focus="RUS" />);
    expect(screen.getByText(/Needs 3 clean laps/)).toBeInTheDocument();
  });
});
