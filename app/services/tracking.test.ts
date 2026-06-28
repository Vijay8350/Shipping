import { describe, expect, it } from "vitest";
import { ShipmentStatus } from "@prisma/client";

import { diffNewEvents, eventKey, isTerminal, trackingUrl } from "./tracking.server";
import type { TrackingEventResult } from "../lib/carriers/types";

const ev = (
  status: ShipmentStatus,
  rawStatus: string,
  iso: string,
): TrackingEventResult => ({ status, rawStatus, occurredAt: new Date(iso) });

describe("tracking helpers (CLAUDE.md §5, §6)", () => {
  it("classifies terminal statuses", () => {
    expect(isTerminal(ShipmentStatus.DELIVERED)).toBe(true);
    expect(isTerminal(ShipmentStatus.RTO_DELIVERED)).toBe(true);
    expect(isTerminal(ShipmentStatus.CANCELLED)).toBe(true);
    expect(isTerminal(ShipmentStatus.IN_TRANSIT)).toBe(false);
    expect(isTerminal(ShipmentStatus.NDR)).toBe(false);
  });

  it("builds courier tracking URLs", () => {
    expect(trackingUrl("delhivery", "DL1")).toContain("delhivery.com/track/package/DL1");
    expect(trackingUrl("shiprocket", "SR1")).toContain("shiprocket.co/tracking/SR1");
    expect(trackingUrl("unknown", "X")).toBeUndefined();
  });

  it("returns only events not already stored", () => {
    const a = ev(ShipmentStatus.READY_TO_SHIP, "Manifested", "2026-06-01T09:00:00Z");
    const b = ev(ShipmentStatus.IN_TRANSIT, "In Transit", "2026-06-02T09:00:00Z");
    const existing = new Set([eventKey(a)]);
    const fresh = diffNewEvents(existing, [a, b]);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].rawStatus).toBe("In Transit");
  });

  it("dedupes within the incoming batch too", () => {
    const a = ev(ShipmentStatus.IN_TRANSIT, "In Transit", "2026-06-02T09:00:00Z");
    const fresh = diffNewEvents(new Set(), [a, a]);
    expect(fresh).toHaveLength(1);
  });
});
