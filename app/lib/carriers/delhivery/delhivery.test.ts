import { describe, expect, it } from "vitest";
import { ShipmentStatus } from "@prisma/client";

import { makeFetchStub } from "../test-helpers";
import type { CreateShipmentInput } from "../types";
import { DelhiveryAdapter } from "./index";
import { normalizeDelhiveryStatus } from "./status";

const creds = { apiToken: "test-token", pickupLocationName: "MAIN_WH" };

const sampleShipInput: CreateShipmentInput = {
  orderName: "#1001",
  reference: "order_1",
  pickup: {
    name: "MAIN_WH",
    phone: "9999999999",
    line1: "Warehouse 1",
    city: "Pune",
    state: "MH",
    pincode: "411001",
  },
  delivery: {
    name: "Asha Rao",
    phone: "8888888888",
    line1: "12 MG Road",
    city: "Mumbai",
    state: "MH",
    pincode: "400001",
  },
  parcel: { weightGrams: 500, lengthCm: 10, widthCm: 10, heightCm: 5 },
  cod: true,
  codAmount: 49900,
  declaredValue: 49900,
  items: [{ name: "T-Shirt", sku: "TS1", quantity: 1, price: 49900 }],
};

describe("DelhiveryAdapter (fixtures)", () => {
  it("normalizes raw statuses to the canonical set (§6)", () => {
    expect(normalizeDelhiveryStatus("Manifested")).toBe(ShipmentStatus.READY_TO_SHIP);
    expect(normalizeDelhiveryStatus("In Transit")).toBe(ShipmentStatus.IN_TRANSIT);
    expect(normalizeDelhiveryStatus("Dispatched")).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    expect(normalizeDelhiveryStatus("Delivered")).toBe(ShipmentStatus.DELIVERED);
    expect(normalizeDelhiveryStatus("Pending", "UD", "Consignee unavailable")).toBe(
      ShipmentStatus.NDR,
    );
    expect(normalizeDelhiveryStatus("RTO", "RT")).toBe(ShipmentStatus.RTO_INITIATED);
    expect(normalizeDelhiveryStatus("Delivered", "RT", "RTO Delivered")).toBe(
      ShipmentStatus.RTO_DELIVERED,
    );
    expect(normalizeDelhiveryStatus("Canceled")).toBe(ShipmentStatus.CANCELLED);
  });

  it("checks serviceability", async () => {
    const { fetchImpl } = makeFetchStub([
      {
        match: "/c/api/pin-codes/json",
        body: { delivery_codes: [{ postal_code: { pin: 400001, cod: "Y", pre_paid: "Y" } }] },
      },
    ]);
    const adapter = new DelhiveryAdapter({ credentials: creds, testMode: true, fetchImpl });
    const res = await adapter.checkServiceability({
      fromPincode: "411001",
      toPincode: "400001",
      weightGrams: 500,
      cod: true,
    });
    expect(res.serviceable).toBe(true);
  });

  it("creates a shipment and returns the AWB", async () => {
    const { fetchImpl, calls } = makeFetchStub([
      {
        match: "/api/cmu/create.json",
        body: { success: true, packages: [{ waybill: "DL123456789", status: "Manifested" }] },
      },
    ]);
    const adapter = new DelhiveryAdapter({ credentials: creds, testMode: true, fetchImpl });
    const res = await adapter.createShipment(sampleShipInput);
    expect(res.awb).toBe("DL123456789");
    expect(res.status).toBe(ShipmentStatus.READY_TO_SHIP);
    // Hits the staging host in test mode.
    expect(calls[0].url).toContain("staging-express.delhivery.com");
  });

  it("throws when creation has no waybill", async () => {
    const { fetchImpl } = makeFetchStub([
      { match: "/api/cmu/create.json", body: { success: false, rmk: "bad pin" } },
    ]);
    const adapter = new DelhiveryAdapter({ credentials: creds, testMode: true, fetchImpl });
    await expect(adapter.createShipment(sampleShipInput)).rejects.toThrow(/bad pin/);
  });

  it("tracks and normalizes events", async () => {
    const { fetchImpl } = makeFetchStub([
      {
        match: "/api/v1/packages/json",
        body: {
          ShipmentData: [
            {
              Shipment: {
                Status: { Status: "In Transit", StatusType: "UD", StatusDateTime: "2026-06-01T10:00:00" },
                Scans: [
                  {
                    ScanDetail: {
                      Scan: "Manifested",
                      ScannedLocation: "Pune",
                      StatusDateTime: "2026-05-31T09:00:00",
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
    const adapter = new DelhiveryAdapter({ credentials: creds, testMode: false, fetchImpl });
    const res = await adapter.track({ awb: "DL123456789" });
    expect(res.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(res.events).toHaveLength(1);
    expect(res.events[0].status).toBe(ShipmentStatus.READY_TO_SHIP);
  });

  it("does not leak the token in errors", async () => {
    const { fetchImpl } = makeFetchStub([
      { match: "/api/cmu/create.json", status: 401, body: { error: "unauthorized" } },
    ]);
    const adapter = new DelhiveryAdapter({ credentials: creds, testMode: true, fetchImpl });
    let err: Error | null = null;
    try {
      await adapter.createShipment(sampleShipInput);
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message).not.toContain("test-token");
  });
});
