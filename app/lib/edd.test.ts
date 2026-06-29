import { describe, expect, it } from "vitest";
import { addDays, eddRange, formatEddDate } from "./edd";

describe("EDD date math (CLAUDE.md §10)", () => {
  const base = new Date("2026-06-01T00:00:00Z");

  it("adds days", () => {
    expect(formatEddDate(addDays(base, 0))).toBe("01 Jun 2026");
    expect(formatEddDate(addDays(base, 7))).toBe("08 Jun 2026");
  });

  it("produces a range label", () => {
    const r = eddRange(base, 2, 5);
    expect(r.minDate).toBe("03 Jun 2026");
    expect(r.maxDate).toBe("06 Jun 2026");
    expect(r.label).toContain("Arrives");
  });

  it("collapses to a single date when min == max", () => {
    const r = eddRange(base, 3, 3);
    expect(r.label).toBe("Arrives by 04 Jun 2026");
  });

  it("normalizes inverted ranges", () => {
    const r = eddRange(base, 7, 2);
    expect(r.minDays).toBe(2);
    expect(r.maxDays).toBe(7);
  });
});
