import { towerRowHeight } from "../LiveTower";

describe("towerRowHeight", () => {
  it("keeps full-size rows when the panel has room", () => {
    expect(towerRowHeight(800, 22)).toBe(23);
  });

  it("packs 22 cars into a half-height panel at 1080p (about 450 px)", () => {
    const row = towerRowHeight(450, 22);
    expect(row).toBeGreaterThanOrEqual(14);
    expect(20 + row * 22).toBeLessThanOrEqual(450);
  });

  it("stops shrinking at a readable floor and lets the panel scroll", () => {
    expect(towerRowHeight(200, 22)).toBe(14);
  });

  it("uses full rows before the panel is measured", () => {
    expect(towerRowHeight(0, 22)).toBe(23);
  });
});
