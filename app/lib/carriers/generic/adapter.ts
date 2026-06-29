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
import type { CredentialField } from "../registry";
import { normalizeGenericStatus } from "./status";

/**
 * Generic REST carrier adapter (CLAUDE.md §7). Powers the Phase 6 couriers that share a
 * conventional token-auth JSON REST surface. The contract, registry resolution, and status
 * normalization (§6) are real and tested; the concrete request/response field shapes are a
 * documented assumption pending each courier's sandbox docs — they are intentionally
 * generic, NOT reverse-engineered per courier (§14: don't fake precision we don't have).
 */
export interface GenericCourierConfig {
  key: string;
  displayName: string;
  prodBase: string;
  stagingBase?: string;
  credentialFields: CredentialField[];
  /** Build auth headers from the decrypted credentials. */
  authHeaders: (creds: Record<string, unknown>) => Record<string, string>;
  normalize?: (raw: string | null | undefined) => ShipmentStatus;
  trackingUrl?: (awb: string) => string;
}

export class GenericRestAdapter implements CarrierAdapter {
  readonly key: string;
  readonly displayName: string;

  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchImpl;
  private readonly normalize: (raw: string | null | undefined) => ShipmentStatus;

  constructor(private readonly config: GenericCourierConfig, ctx: AdapterContext) {
    this.key = config.key;
    this.displayName = config.displayName;
    this.base = ctx.testMode ? config.stagingBase ?? config.prodBase : config.prodBase;
    this.headers = { "Content-Type": "application/json", ...config.authHeaders(ctx.credentials) };
    this.fetchImpl = resolveFetch(ctx.fetchImpl);
    this.normalize = config.normalize ?? normalizeGenericStatus;
  }

  async checkServiceability(input: ServiceabilityInput): Promise<ServiceabilityResult> {
    const data = await httpJson<{ serviceable?: boolean; available?: boolean; couriers?: unknown[] }>(
      this.fetchImpl,
      this.key,
      `${this.base}/serviceability?from=${input.fromPincode}&to=${input.toPincode}&cod=${input.cod ? 1 : 0}`,
      { headers: this.headers },
    );
    const serviceable = data.serviceable ?? data.available ?? (data.couriers?.length ?? 0) > 0;
    return { serviceable: Boolean(serviceable), options: serviceable ? [{ courierName: this.displayName }] : [], raw: data };
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    const data = await httpJson<{ awb?: string; waybill?: string; shipment_id?: string; status?: string }>(
      this.fetchImpl,
      this.key,
      `${this.base}/shipments`,
      { method: "POST", headers: this.headers, body: JSON.stringify(buildShipmentBody(input)) },
    );
    const awb = data.awb ?? data.waybill;
    if (!awb) throw new CarrierError(`${this.key}: no AWB returned`, this.key, undefined, data);
    return {
      awb: String(awb),
      courierKey: this.key,
      externalShipmentId: data.shipment_id ? String(data.shipment_id) : String(awb),
      status: this.normalize(data.status) ?? ShipmentStatus.READY_TO_SHIP,
      rawStatus: data.status ?? "Booked",
      raw: data,
    };
  }

  async schedulePickup(input: PickupInput): Promise<PickupResult> {
    const data = await httpJson<{ pickup_id?: string; scheduled_for?: string }>(
      this.fetchImpl,
      this.key,
      `${this.base}/pickups`,
      { method: "POST", headers: this.headers, body: JSON.stringify({ date: input.pickupDate, awb: input.awb }) },
    );
    return { pickupId: data.pickup_id, scheduledFor: data.scheduled_for ?? input.pickupDate, raw: data };
  }

  async getLabel(input: LabelInput): Promise<LabelResult> {
    const data = await httpJson<{ label_url?: string; url?: string }>(
      this.fetchImpl,
      this.key,
      `${this.base}/labels/${encodeURIComponent(input.awb)}`,
      { headers: this.headers },
    );
    return { url: data.label_url ?? data.url, raw: data };
  }

  async track(input: TrackInput): Promise<TrackingResult> {
    const data = await httpJson<GenericTrackResponse>(
      this.fetchImpl,
      this.key,
      `${this.base}/track/${encodeURIComponent(input.awb)}`,
      { headers: this.headers },
    );
    const scans = data.events ?? data.scans ?? [];
    const events = scans.map((e) => ({
      status: this.normalize(e.status),
      rawStatus: e.status ?? "",
      location: e.location ?? undefined,
      message: e.message ?? e.remark ?? undefined,
      occurredAt: e.time || e.date ? new Date((e.time || e.date) as string) : new Date(0),
    }));
    const currentRaw = data.status ?? scans[scans.length - 1]?.status ?? "";
    return { awb: input.awb, status: this.normalize(currentRaw), rawStatus: String(currentRaw), events, raw: data };
  }

  async cancel(input: CancelInput): Promise<CancelResult> {
    const data = await httpJson<{ cancelled?: boolean; success?: boolean }>(
      this.fetchImpl,
      this.key,
      `${this.base}/shipments/${encodeURIComponent(input.awb)}/cancel`,
      { method: "POST", headers: this.headers, body: "{}" },
    );
    return { cancelled: Boolean(data.cancelled ?? data.success), raw: data };
  }
}

function buildShipmentBody(input: CreateShipmentInput) {
  return {
    reference: input.reference,
    order_name: input.orderName,
    pickup: input.pickup,
    delivery: input.delivery,
    weight_grams: input.parcel.weightGrams,
    cod: input.cod,
    cod_amount: input.cod ? (input.codAmount ?? 0) / 100 : 0,
    declared_value: input.declaredValue / 100,
    items: input.items.map((i) => ({ name: i.name, qty: i.quantity, price: i.price / 100 })),
  };
}

interface GenericTrackResponse {
  status?: string;
  events?: Array<{ status?: string; location?: string; message?: string; remark?: string; time?: string; date?: string }>;
  scans?: Array<{ status?: string; location?: string; message?: string; remark?: string; time?: string; date?: string }>;
}
