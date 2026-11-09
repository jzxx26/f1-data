import type { PaceModel } from "@/lib/live";
import { fireEvent, render, screen } from "@testing-library/react";
import { RacePace, trendLabel } from "../widgets/RacePace";

const model: PaceModel = {
  status: "ok",
  laps_total: 394,
  laps_used: 288,
  traffic_s: 1.5,
  method: "Least squares over clean laps",
  sigma: 0.27,
  fuel: { identified: true, s_per_lap: -0.027 },
  compounds: [{ compound: "SOFT", deg_s_per_lap: 0.046, offset_s: 0, laps: 288 }],
  drivers: [
    { driver: "RUS", pace_delta: 0, clean_laps: 14, recent_vs_model: -0.07, compound: "SOFT", tyre_age: 5, expected_lap: 73.7 },
    { driver: "LAW", pace_delta: 1.113, clean_laps: 15, recent_vs_model: -0.242, compound: "SOFT", tyre_age: 7, expected_lap: 74.1 },
    { driver: "LIN", pace_delta: 1.18, clean_laps: 12, recent_vs_model: 0.241, compound: "SOFT", tyre_age: 10, expected_lap: 74.3 },
  ],
};

describe("RacePace", () => {
  it("ranks by underlying pace and shows wear and the measured fuel effect", () => {
    render(<RacePace data={model} drivers={[]} focus="LAW" onFocus={jest.fn()} />);

    expect(screen.getByText("best")).toBeInTheDocument();
    expect(screen.getByText("+1.113")).toBeInTheDocument();
    expect(screen.getByText(/S wear \+0\.046 s\/lap/)).toBeInTheDocument();
    expect(screen.getByText("Fuel −0.027 s/lap (measured)")).toBeInTheDocument();
    expect(screen.getByText(/288 of 394 laps are clean/)).toBeInTheDocument();
  });

  it("says when fuel cannot be told apart from wear yet", () => {
    render(<RacePace data={{ ...model, fuel: { identified: false, s_per_lap: null } }} drivers={[]} focus={null} onFocus={jest.fn()} />);
    expect(screen.getByText("Fuel not separable yet: wear includes it")).toBeInTheDocument();
  });

  it("explains thin data instead of showing numbers", () => {
    render(
      <RacePace data={{ ...model, status: "not_enough_laps", reason: "Needs 3 clean laps from at least two cars." }} drivers={[]} focus={null} onFocus={jest.fn()} />
    );
    expect(screen.getByText(/Needs 3 clean laps/)).toBeInTheDocument();
  });

  it("focuses a driver on click", () => {
    const onFocus = jest.fn();
    render(<RacePace data={model} drivers={[]} focus={null} onFocus={onFocus} />);
    fireEvent.click(screen.getByText("LIN"));
    expect(onFocus).toHaveBeenCalledWith("LIN");
  });
});

describe("trendLabel", () => {
  it("calls a trend only outside the model's noise", () => {
    expect(trendLabel(-0.07)).toEqual({ text: "as expected", tone: "flat" });
    expect(trendLabel(-0.242)?.tone).toBe("quick");
    expect(trendLabel(0.241)?.text).toBe("+0.24 slower than expected");
    expect(trendLabel(null)).toBeNull();
  });
});
