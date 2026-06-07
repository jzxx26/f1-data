import type { Driver } from "@/lib/openf1";
import { fireEvent, render, screen } from "@testing-library/react";
import { DriverSelector } from "../RaceArchive";

const drivers: Driver[] = [
  {
    driver_number: 1,
    broadcast_name: "M VERSTAPPEN",
    name_acronym: "VER",
    team_name: "Red Bull Racing",
    team_colour: "3671C6",
  },
  {
    driver_number: 16,
    broadcast_name: "C LECLERC",
    name_acronym: "LEC",
    team_name: "Ferrari",
    team_colour: "DC0000",
  },
  {
    driver_number: 44,
    broadcast_name: "L HAMILTON",
    name_acronym: "HAM",
    team_name: "Mercedes",
    team_colour: "00D2BE",
  },
];

describe("DriverSelector", () => {
  it("allows selecting up to two drivers and replaces oldest selection", () => {
    const handleChange = jest.fn();

    const { rerender } = render(
      <DriverSelector
        drivers={drivers}
        selected={[1]}
        onChange={handleChange}
      />
    );

    fireEvent.click(screen.getByText(/LEC/));
    expect(handleChange).toHaveBeenLastCalledWith([1, 16]);

    rerender(
      <DriverSelector
        drivers={drivers}
        selected={[1, 16]}
        onChange={handleChange}
      />
    );

    fireEvent.click(screen.getByText(/HAM/));
    expect(handleChange).toHaveBeenLastCalledWith([16, 44]);
  });
});
