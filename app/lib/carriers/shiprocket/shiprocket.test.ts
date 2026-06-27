import { describe, expect, it } from "vitest";
import { ShipmentStatus } from "@prisma/client";

import { makeFetchStub } from "../test-helpers";
import type { CreateShipmentInput } from "../types";
import { ShiprocketAdapter } from "./index";
import { normalizeShiprocketStatus } from "./status";

const creds = { email: "api@example.com", password: "secret-pass", pickupLocation: "Primary" };

const shipInput: CreateShipmentInput = {
  orderName: "#2002",
  reference: "order_2",
  pickup: { name: "Primary", phone: "9999999999", line1: "WH", city: "Pune", state: "MH", pincode: "411001" },
  delivery: {
    name: "Ravi Kumar",
    phone: "8888888888",
    line1: "5 Park St",
    city: "Delhi",
    state: "DL",
    pincode: "110001",
  },
  parcel: { weightGrams: 800 },
  cod: false,
  declaredValue: 120000,
  items: [{ name: "Mug", sku: "MUG1", quantity: 2, price: 60000 }],
  courierId: 24,
};

describe("ShiprocketAdapter (fixtures)", () => {
  it("normalizes raw statuses to the canonical set (§6)", () => {
    expect(normalizeShiprocketStatus("NEW")).toBe(ShipmentStatus.READY_TO_SHIP);
    expect(normalizeShiprocketStatus("IN TRANSIT")).toBe(ShipmentStatus.IN_TRANSIT);
    expect(normalizeShiprocketStatus("Out For Delivery")).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    expect(normalizeShiprocketStatus("DELIVERED")).toBe(ShipmentStatus.DELIVERED);
    expect(normalizeShiprocketStatus("Undelivered")).toBe(ShipmentStatus.NDR);
    expect(normalizeShiprocketStatus("RTO Initiated")).toBe(ShipmentStatus.RTO_INITIATED);
    expect(normalizeShiprocketStatus("RTO Delivered")).toBe(ShipmentStatus.RTO_DELIVERED);
    expect(normalizeShiprocketStatus("CANCELED")).toBe(ShipmentStatus.CANCELLED);
  });

  it("authenticates, creates an order, assigns an AWB", async () => {
    const { fetchImpl, calls } = makeFetchStub([
      { match: "/auth/login", body: { token: "jwt-token" } },
      { match: "/orders/create/adhoc", body: { order_id: 555, shipment_id: 777, status: "NEW" } },
      {
        match: "/courier/assign/awb",
        body: { response: { data: { awb_code: "SR987654321", courier_name: "Xpressbees", applied_weight_amount: "55.50" } } },
      },
    ]);
    const adapter = new ShiprocketAdapter({ credentials: creds, testMode: true, fetchImpl });
    const res = await adapter.createShipment(shipInput);

    expect(res.awb).toBe("SR987654321");
    expect(res.externalShipmentId).toBe("777");
    expect(res.status).toBe(ShipmentStatus.READY_TO_SHIP);
    expect(res.cost).toBe(5550); // minor units
    // Auth happens before the order create.
    expect(calls[0].url).toContain("/auth/login");
    // Bearer token is attached to the create call.
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toContain("jwt-token");
  });

  it("serviceability returns courier options with ids", async () => {
    const { fetchImpl } = makeFetchStub([
      { match: "/auth/login", body: { token: "jwt-token" } },
      {
        match: "/courier/serviceability",
        body: {
          data: {
            available_courier_companies: [
              { courier_company_id: 24, courier_name: "Xpressbees", rate: 55.5, estimated_delivery_days: "3" },
            ],
          },
        },
      },
    ]);
    const adapter = new ShiprocketAdapter({ credentials: creds, testMode: false, fetchImpl });
    const res = await adapter.checkServiceability({
      fromPincode: "411001",
      toPincode: "110001",
      weightGrams: 800,
      cod: false,
    });
    expect(res.serviceable).toBe(true);
    expect(res.options[0].courierId).toBe(24);
    expect(res.options[0].rate).toBe(5550);
  });

  it("tracks and normalizes activities", async () => {
    const { fetchImpl } = makeFetchStub([
      { match: "/auth/login", body: { token: "jwt-token" } },
      {
        match: "/courier/track/awb",
        body: {
          tracking_data: {
            shipment_track: [{ current_status: "In Transit" }],
            shipment_track_activities: [
              { date: "2026-06-01 10:00:00", status: "IN TRANSIT", activity: "Shipment in transit", location: "Pune" },
              { date: "2026-06-02 18:00:00", status: "DELIVERED", activity: "Delivered", location: "Delhi" },
            ],
          },
        },
      },
    ]);
    const adapter = new ShiprocketAdapter({ credentials: creds, testMode: false, fetchImpl });
    const res = await adapter.track({ awb: "SR987654321" });
    expect(res.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(res.events).toHaveLength(2);
    expect(res.events[1].status).toBe(ShipmentStatus.DELIVERED);
  });

  it("does not leak the password in errors", async () => {
    const { fetchImpl } = makeFetchStub([
      { match: "/auth/login", status: 403, body: { message: "bad creds" } },
    ]);
    const adapter = new ShiprocketAdapter({ credentials: creds, testMode: true, fetchImpl });
    let err: Error | null = null;
    try {
      await adapter.createShipment(shipInput);
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message).not.toContain("secret-pass");
  });
});
