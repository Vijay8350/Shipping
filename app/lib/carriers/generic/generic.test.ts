import { describe, expect, it } from "vitest";
import { ShipmentStatus } from "@prisma/client";

import { createAdapter, isSupportedCourier, SUPPORTED_COURIERS } from "../registry";
import { makeFetchStub } from "../test-helpers";
import type { CreateShipmentInput } from "../types";
import { normalizeGenericStatus } from "./status";
import { GENERIC_COURIER_CONFIGS } from "./configs";

const ALL_KEYS = ["delhivery", "shiprocket", "bluedart", "dtdc", "amazon_shipping", "shree_maruti", "trackon"];

const shipInput: CreateShipmentInput = {
  orderName: "#9001",
  reference: "order_9",
  pickup: { name: "WH", phone: "9", line1: "A", city: "Pune", state: "MH", pincode: "411001" },
  delivery: { name: "Cust", phone: "8", line1: "B", city: "Delhi", state: "DL", pincode: "110001" },
  parcel: { weightGrams: 500 },
  cod: false,
  declaredValue: 100000,
  items: [{ name: "x", quantity: 1, price: 100000 }],
};

describe("all 7 couriers (CLAUDE.md §7)", () => {
  it("registers and resolves every courier through the contract", () => {
    for (const key of ALL_KEYS) {
      expect(isSupportedCourier(key)).toBe(true);
      expect(SUPPORTED_COURIERS.find((c) => c.key === key)).toBeTruthy();
    }
  });

  it("generic status normalization covers the canonical set (§6)", () => {
    expect(normalizeGenericStatus("Booked")).toBe(ShipmentStatus.READY_TO_SHIP);
    expect(normalizeGenericStatus("In Transit")).toBe(ShipmentStatus.IN_TRANSIT);
    expect(normalizeGenericStatus("Out for delivery")).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    expect(normalizeGenericStatus("Delivered")).toBe(ShipmentStatus.DELIVERED);
    expect(normalizeGenericStatus("Undelivered")).toBe(ShipmentStatus.NDR);
    expect(normalizeGenericStatus("RTO")).toBe(ShipmentStatus.RTO_INITIATED);
    expect(normalizeGenericStatus("RTO Delivered")).toBe(ShipmentStatus.RTO_DELIVERED);
    expect(normalizeGenericStatus("Cancelled")).toBe(ShipmentStatus.CANCELLED);
  });
});

describe("GenericRestAdapter (fixtures)", () => {
  for (const cfg of GENERIC_COURIER_CONFIGS) {
    it(`${cfg.key}: creates a shipment and tracks it`, async () => {
      const creds = Object.fromEntries(cfg.credentialFields.map((f) => [f.name, "x"]));
      const { fetchImpl } = makeFetchStub([
        { match: "/shipments", body: { awb: `${cfg.key}-AWB1`, status: "Booked" } },
        { match: "/track/", body: { status: "In Transit", events: [{ status: "Booked", time: "2026-06-01T09:00:00Z" }] } },
      ]);
      const adapter = createAdapter(cfg.key, { credentials: creds, testMode: true, fetchImpl });

      const ship = await adapter.createShipment(shipInput);
      expect(ship.awb).toBe(`${cfg.key}-AWB1`);
      expect(ship.status).toBe(ShipmentStatus.READY_TO_SHIP);

      const track = await adapter.track({ awb: ship.awb });
      expect(track.status).toBe(ShipmentStatus.IN_TRANSIT);
      expect(track.events).toHaveLength(1);
    });
  }

  it("does not leak credentials in errors", async () => {
    const { fetchImpl } = makeFetchStub([{ match: "/shipments", status: 401, body: { error: "no" } }]);
    const adapter = createAdapter("dtdc", { credentials: { apiKey: "super-secret-key" }, testMode: true, fetchImpl });
    let err: Error | null = null;
    try {
      await adapter.createShipment(shipInput);
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message).not.toContain("super-secret-key");
  });
});
