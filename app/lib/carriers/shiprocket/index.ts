import { ShipmentStatus } from "@prisma/client";

import { httpJson, resolveFetch } from "../http";
import {
  CarrierError,
  type AdapterContext,
  type CancelInput,
  type CancelResult,
  type CarrierAdapter,
  type CreateShipmentInput,
  type FetchImpl,
  type LabelInput,
  type LabelResult,
  type PickupInput,
  type PickupResult,
  type ServiceabilityInput,
  type ServiceabilityResult,
  type ShipmentResult,
  type TrackInput,
  type TrackingResult,
} from "../types";
import { normalizeShiprocketStatus } from "./status";

/**
 * Shiprocket adapter (CLAUDE.md §7). Auth is email/password exchanged for a bearer token
 * (cached per adapter instance). Credentials shape:
 *   { email: string, password: string, pickupLocation?: string }
 *
 * Shiprocket has no separate sandbox host; test mode is an account-level concept, so the
 * testMode flag is carried for parity but the base URL is unchanged (documented, §14).
 * API shapes follow Shiprocket's public External API; validate against a live test
 * account before production.
 */
const BASE = "https://apiv2.shiprocket.in/v1/external";

const toMajor = (minor?: number) => (minor == null ? 0 : minor / 100);
const toKg = (grams: number) => Math.max(0.01, grams / 1000);

interface ShiprocketCreds {
  email: string;
  password: string;
  pickupLocation?: string;
}

export class ShiprocketAdapter implements CarrierAdapter {
  readonly key = "shiprocket";
  readonly displayName = "Shiprocket";

  private readonly email: string;
  private readonly password: string;
  private readonly pickupLocation?: string;
  private readonly fetchImpl: FetchImpl;
  private tokenPromise: Promise<string> | null = null;

  constructor(ctx: AdapterContext) {
    const creds = ctx.credentials as Partial<ShiprocketCreds>;
    if (!creds.email || !creds.password) {
      throw new CarrierError("shiprocket: missing email/password credentials", this.key);
    }
    this.email = creds.email;
    this.password = creds.password;
    this.pickupLocation = creds.pickupLocation;
    this.fetchImpl = resolveFetch(ctx.fetchImpl);
  }

  private token(): Promise<string> {
    this.tokenPromise ??= httpJson<{ token?: string }>(
      this.fetchImpl,
      this.key,
      `${BASE}/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: this.email, password: this.password }),
      },
    ).then((res) => {
      if (!res.token) throw new CarrierError("shiprocket: auth failed", this.key);
      return res.token;
    });
    return this.tokenPromise;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${await this.token()}`,
      "Content-Type": "application/json",
    };
  }

  async checkServiceability(
    input: ServiceabilityInput,
  ): Promise<ServiceabilityResult> {
    const params = new URLSearchParams({
      pickup_postcode: input.fromPincode,
      delivery_postcode: input.toPincode,
      weight: String(toKg(input.weightGrams)),
      cod: input.cod ? "1" : "0",
    });
    const data = await httpJson<ShiprocketServiceabilityResponse>(
      this.fetchImpl,
      this.key,
      `${BASE}/courier/serviceability/?${params.toString()}`,
      { headers: await this.authHeaders() },
    );

    const companies = data.data?.available_courier_companies ?? [];
    return {
      serviceable: companies.length > 0,
      options: companies.map((c) => ({
        courierName: c.courier_name,
        courierId: c.courier_company_id,
        etaDays: c.estimated_delivery_days ? Number(c.estimated_delivery_days) : undefined,
        rate: c.rate != null ? Math.round(Number(c.rate) * 100) : undefined,
      })),
      raw: data,
    };
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    const headers = await this.authHeaders();

    // 1) Create an adhoc order.
    const orderPayload = {
      order_id: input.reference,
      order_date: new Date().toISOString().slice(0, 10),
      pickup_location: this.pickupLocation ?? input.pickup.name,
      billing_customer_name: input.delivery.name,
      billing_last_name: "",
      billing_address: [input.delivery.line1, input.delivery.line2]
        .filter(Boolean)
        .join(", "),
      billing_city: input.delivery.city,
      billing_pincode: input.delivery.pincode,
      billing_state: input.delivery.state,
      billing_country: input.delivery.country ?? "India",
      billing_email: input.delivery.email ?? "",
      billing_phone: input.delivery.phone,
      shipping_is_billing: true,
      order_items: input.items.map((i) => ({
        name: i.name,
        sku: i.sku ?? i.name,
        units: i.quantity,
        selling_price: toMajor(i.price),
      })),
      payment_method: input.cod ? "COD" : "Prepaid",
      sub_total: toMajor(input.declaredValue),
      length: input.parcel.lengthCm ?? 10,
      breadth: input.parcel.widthCm ?? 10,
      height: input.parcel.heightCm ?? 10,
      weight: toKg(input.parcel.weightGrams),
    };

    const created = await httpJson<ShiprocketCreateResponse>(
      this.fetchImpl,
      this.key,
      `${BASE}/orders/create/adhoc`,
      { method: "POST", headers, body: JSON.stringify(orderPayload) },
    );

    const shipmentId = created.shipment_id;
    if (!shipmentId) {
      throw new CarrierError("shiprocket: order creation returned no shipment_id", this.key, undefined, created);
    }

    // 2) Assign an AWB (selecting the courier chosen during serviceability, if any).
    const assigned = await httpJson<ShiprocketAssignResponse>(
      this.fetchImpl,
      this.key,
      `${BASE}/courier/assign/awb`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          shipment_id: shipmentId,
          ...(input.courierId ? { courier_id: input.courierId } : {}),
        }),
      },
    );

    const awb = assigned.response?.data?.awb_code ?? created.awb_code;
    if (!awb) {
      throw new CarrierError("shiprocket: no AWB returned after assignment", this.key, undefined, assigned);
    }

    return {
      awb: String(awb),
      courierKey: this.key,
      externalShipmentId: String(shipmentId),
      status: normalizeShiprocketStatus(created.status) ?? ShipmentStatus.READY_TO_SHIP,
      rawStatus: created.status ?? "NEW",
      cost:
        assigned.response?.data?.applied_weight_amount != null
          ? Math.round(Number(assigned.response.data.applied_weight_amount) * 100)
          : undefined,
      raw: { created, assigned },
    };
  }

  async schedulePickup(input: PickupInput): Promise<PickupResult> {
    if (!input.externalShipmentId) {
      throw new CarrierError("shiprocket: schedulePickup requires externalShipmentId", this.key);
    }
    const data = await httpJson<{ pickup_status?: number; response?: { pickup_scheduled_date?: string } }>(
      this.fetchImpl,
      this.key,
      `${BASE}/courier/generate/pickup`,
      {
        method: "POST",
        headers: await this.authHeaders(),
        body: JSON.stringify({ shipment_id: [Number(input.externalShipmentId)] }),
      },
    );
    return { scheduledFor: data.response?.pickup_scheduled_date, raw: data };
  }

  async getLabel(input: LabelInput): Promise<LabelResult> {
    if (!input.externalShipmentId) {
      throw new CarrierError("shiprocket: getLabel requires externalShipmentId", this.key);
    }
    const data = await httpJson<{ label_created?: number; label_url?: string }>(
      this.fetchImpl,
      this.key,
      `${BASE}/courier/generate/label`,
      {
        method: "POST",
        headers: await this.authHeaders(),
        body: JSON.stringify({ shipment_id: [Number(input.externalShipmentId)] }),
      },
    );
    return { url: data.label_url, raw: data };
  }

  async track(input: TrackInput): Promise<TrackingResult> {
    const data = await httpJson<ShiprocketTrackResponse>(
      this.fetchImpl,
      this.key,
      `${BASE}/courier/track/awb/${encodeURIComponent(input.awb)}`,
      { headers: await this.authHeaders() },
    );

    const td = data.tracking_data;
    const activities = td?.shipment_track_activities ?? [];
    const events = activities.map((a) => ({
      status: normalizeShiprocketStatus(a.status ?? a.activity),
      rawStatus: a.status ?? a.activity ?? "",
      location: a.location ?? undefined,
      message: a.activity ?? undefined,
      occurredAt: a.date ? new Date(a.date) : new Date(0),
    }));

    const currentRaw =
      td?.shipment_track?.[0]?.current_status ??
      (typeof td?.shipment_status === "string" ? td.shipment_status : "") ??
      "";

    return {
      awb: input.awb,
      status: normalizeShiprocketStatus(currentRaw),
      rawStatus: String(currentRaw),
      events,
      raw: data,
    };
  }

  async cancel(input: CancelInput): Promise<CancelResult> {
    // Shiprocket cancels by order id; the ship workflow stores it as externalShipmentId
    // only when the order id is known. Validate against the live API (§14).
    const id = input.externalShipmentId ?? input.awb;
    const data = await httpJson<{ status_code?: number; message?: string }>(
      this.fetchImpl,
      this.key,
      `${BASE}/orders/cancel`,
      {
        method: "POST",
        headers: await this.authHeaders(),
        body: JSON.stringify({ ids: [id] }),
      },
    );
    return { cancelled: data.status_code === 200 || /cancel/i.test(data.message ?? ""), raw: data };
  }
}

// ── Response shapes (partial) ───────────────────────────────────────────────
interface ShiprocketServiceabilityResponse {
  data?: {
    available_courier_companies?: Array<{
      courier_company_id?: number;
      courier_name?: string;
      rate?: number | string;
      estimated_delivery_days?: number | string;
    }>;
  };
}

interface ShiprocketCreateResponse {
  order_id?: number;
  shipment_id?: number;
  status?: string;
  awb_code?: string;
}

interface ShiprocketAssignResponse {
  response?: {
    data?: {
      awb_code?: string;
      courier_name?: string;
      applied_weight_amount?: number | string;
    };
  };
}

interface ShiprocketTrackResponse {
  tracking_data?: {
    shipment_status?: string | number;
    shipment_track?: Array<{ current_status?: string }>;
    shipment_track_activities?: Array<{
      date?: string;
      status?: string;
      activity?: string;
      location?: string;
    }>;
  };
}
