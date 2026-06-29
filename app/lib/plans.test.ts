import { describe, expect, it } from "vitest";
import { getPlan, planHasFeature, splitIncludedOverage } from "./plans";

describe("plans (CLAUDE.md §10)", () => {
  it("falls back to the free plan for unknown keys", () => {
    expect(getPlan(undefined).key).toBe("free");
    expect(getPlan("nope").key).toBe("free");
    expect(getPlan("gold").key).toBe("gold");
  });

  it("gates premium features", () => {
    expect(planHasFeature("free", "premiumAnalytics")).toBe(false);
    expect(planHasFeature("silver", "premiumAnalytics")).toBe(true);
    expect(planHasFeature("free", "automationRules")).toBe(false);
    expect(planHasFeature("gold", "automationRules")).toBe(true);
  });

  describe("splitIncludedOverage (§9.2 no double-billing)", () => {
    it("all included when under the limit", () => {
      expect(splitIncludedOverage(0, 50, 10)).toEqual({ includedCount: 10, overageCount: 0 });
    });
    it("splits at the boundary", () => {
      expect(splitIncludedOverage(45, 50, 10)).toEqual({ includedCount: 5, overageCount: 5 });
    });
    it("all overage once the limit is consumed", () => {
      expect(splitIncludedOverage(50, 50, 8)).toEqual({ includedCount: 0, overageCount: 8 });
      expect(splitIncludedOverage(60, 50, 8)).toEqual({ includedCount: 0, overageCount: 8 });
    });
  });
});
