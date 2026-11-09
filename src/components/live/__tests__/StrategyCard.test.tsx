import type { LiveDriver, StrategyResponse } from "@/lib/live";
import { placeText } from "@/lib/live";
import { fireEvent, render, screen } from "@testing-library/react";
import { marginLines, StrategyCard } from "../StrategyCard";
// A real /live/strategy response: the recorded 2026 Sao Paulo race, lap 40, NOR, 20 s net.
import fixture from "./strategy.fixture.json";

const data = fixture as unknown as StrategyResponse;
const drivers: LiveDriver[] = [
  { driver_number: "1", name_acronym: "NOR", team_colour: "#FF8000", team_name: "McLaren", full_name: "Lando Norris" },
];
const order = data.prediction.projected_order.filter((n) => n.driver !== "NOR").map((n) => n.driver);

function renderCard(overrides: Partial<Parameters<typeof StrategyCard>[0]> = {}) {
  const props = {
    data,
    drivers,
    order: ["NOR", ...order],
    driver: "NOR",
    netLoss: 20,
    onDriver: jest.fn(),
    onNetLoss: jest.fn(),
    ...overrides,
  };
  render(<StrategyCard {...props} />);
  return props;
}

describe("StrategyCard", () => {
  it("labels the slider as an estimated net pit loss", () => {
    renderCard();

    expect(screen.getByLabelText(/Estimated net pit loss \(s\)/)).toHaveValue("20");
  });

  it("keeps the assumption and the observed pit lane time apart", () => {
    renderCard();

    expect(screen.getByText(/Assumption ·/)).toBeInTheDocument();
    expect(screen.getByText(/Observed ·/)).toBeInTheDocument();
    expect(screen.getByText(/2 stop\(s\) timed so far, 3 needed/)).toBeInTheDocument();
  });

  it("shows the rejoin, now and after", () => {
    renderCard();

    expect(screen.getByText("After the stop").nextSibling).toHaveTextContent("P4");
    expect(screen.getByText("PITS")).toBeInTheDocument();
  });

  it("names the cars at either margin", () => {
    expect(marginLines(data)).toEqual([
      "3.789 s more net loss and PIA is ahead (a tie goes to the car already there).",
      "More than 2.618 s less net loss passes ANT for P3.",
    ]);
  });

  it("labels the three stops as scenarios, not a confidence interval", () => {
    renderCard();

    expect(screen.getByText(/Scenarios · not a confidence interval/)).toBeInTheDocument();
    expect(screen.getByText("18.0 s net")).toBeInTheDocument();
    expect(screen.getByText("22.0 s net")).toBeInTheDocument();
  });

  it("reset returns the slider to the default assumption", () => {
    const props = renderCard({ netLoss: 27 });

    fireEvent.click(screen.getByRole("button", { name: /Reset to 20.0 s/ }));

    expect(props.onNetLoss).toHaveBeenCalledWith(20);
  });

  it("shows the reason instead of a position when there is none", () => {
    renderCard({
      data: {
        ...data,
        prediction: {
          ...data.prediction,
          status: "unsupported",
          position: null,
          reason: "A safety car is out: a stop costs far less than under green, and V1 does not model it",
        },
      },
    });

    expect(screen.getByText(/A safety car is out/)).toBeInTheDocument();
    expect(screen.queryByText("After the stop")).not.toBeInTheDocument();
  });

  it("shows a stale warning from the backend", () => {
    renderCard({ data: { ...data, stale: "No update for 95 s: the order and gaps are from then" } });

    expect(screen.getByText(/No update for 95 s/)).toBeInTheDocument();
  });
});

describe("placeText", () => {
  it("writes a position, a range or a dash", () => {
    expect(placeText(4, null)).toBe("P4");
    expect(placeText(null, [2, 3])).toBe("P2–P3");
    expect(placeText(null, null)).toBe("–");
  });
});

describe("pit loss from past races", () => {
  const history = {
    event: "Las Vegas Grand Prix",
    years: [2023, 2024, 2025],
    overall: { median: 22.4, p25: 21.5, p75: 24.4, stops: 69 },
    per_year: [],
    method: "In-lap + out-lap",
  };

  it("shows the measured value and sets the slider to it, rounded to the slider's step", () => {
    const { onNetLoss } = renderCard({ history });

    expect(screen.getByText(/22\.4 s net here 2023–2025, middle half 21\.5–24\.4 s \(69 green-flag stops\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use 22.5 s" }));
    expect(onNetLoss).toHaveBeenCalledWith(22.5);
  });

  it("says when it is still measuring, and shows nothing without history", () => {
    renderCard({ historyLoading: true });
    expect(screen.getByText(/Measuring net pit loss/)).toBeInTheDocument();
  });

  it("keeps the slider's default when the circuit has no history", () => {
    renderCard({ history: { ...history, years: [], overall: null } });
    expect(screen.queryByText(/History ·/)).not.toBeInTheDocument();
  });
});
