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
import { normalizeDelhiveryStatus } from "./status";

/**
 * Delhivery adapter (CLAUDE.md §7). Auth is a per-merchant API token (Authorization:
 * Token <token>) read from the encrypted CourierAccount. Test mode routes to the staging
 * host. Credentials shape: { apiToken: string, pickupLocationName?: string }.
 *
 * API shapes follow Delhivery's public One/B2C docs; validate field-by-field against a
 * live sandbox account before production (§14).
 */
const PROD_BASE = "https://track.delhivery.com";
const STAGING_BASE = "https://staging-express.delhivery.com";

const toMajor = (minor?: number) => (minor == null ? 0 : minor / 100);

interface DelhiveryCreds {
  apiToken: string;
  pickupLocationName?: string;
}

export class DelhiveryAdapter implements CarrierAdapter {
  readonly key = "delhivery";
  readonly displayName = "Delhivery";

  private readonly token: string;
  private readonly pickupLocationName?: string;
  private readonly base: string;
  private readonly fetchImpl: FetchImpl;

  constructor(ctx: AdapterContext) {
    const creds = ctx.credentials as Partial<DelhiveryCreds>;
    if (!creds.apiToken) {
      throw new CarrierError("delhivery: missing apiToken credential", this.key);
    }
    this.token = creds.apiToken;
    this.pickupLocationName = creds.pickupLocationName;
    this.base = ctx.testMode ? STAGING_BASE : PROD_BASE;
    this.fetchImpl = resolveFetch(ctx.fetchImpl);
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Token ${this.token}`, Accept: "application/json" };
  }

  async checkServiceability(
    input: ServiceabilityInput,
  ): Promise<ServiceabilityResult> {
    const url = `${this.base}/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(input.toPincode)}`;
    const data = await httpJson<{ delivery_codes?: Array<{ postal_code?: Record<string, unknown> }> }>(
      this.fetchImpl,
      this.key,
      url,
      { headers: this.authHeaders() },
    );

    const code = data.delivery_codes?.[0]?.postal_code as
      | { cod?: string; pre_paid?: string }
      | undefined;
    const serviceable = code
      ? input.cod
        ? code.cod === "Y"
        : code.pre_paid === "Y"
      : false;

    return { serviceable, options: serviceable ? [{ courierName: "Delhivery" }] : [], raw: data };
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    const pickupName = this.pickupLocationName ?? input.pickup.name;
    const shipmentPayload = {
      shipments: [
        {
          name: input.delivery.name,
          add: [input.delivery.line1, input.delivery.line2].filter(Boolean).join(", "),
          pin: input.delivery.pincode,
          city: input.delivery.city,
          state: input.delivery.state,
          country: input.delivery.country ?? "India",
          phone: input.delivery.phone,
          order: input.orderName,
          payment_mode: input.cod ? "COD" : "Prepaid",
          cod_amount: input.cod ? toMajor(input.codAmount) : 0,
          total_amount: toMajor(input.declaredValue),
          quantity: input.items.reduce((n, i) => n + i.quantity, 0) || 1,
          weight: input.parcel.weightGrams,
          shipment_length: input.parcel.lengthCm,
          shipment_width: input.parcel.widthCm,
          shipment_height: input.parcel.heightCm,
          products_desc: input.items.map((i) => i.name).join(", ").slice(0, 250),
        },
      ],
      pickup_location: { name: pickupName },
    };

    const body = `format=json&data=${encodeURIComponent(JSON.stringify(shipmentPayload))}`;
    const data = await httpJson<DelhiveryCreateResponse>(
      this.fetchImpl,
      this.key,
      `${this.base}/api/cmu/create.json`,
      {
        method: "POST",
        headers: {
          ...this.authHeaders(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    const pkg = data.packages?.[0];
    if (!pkg?.waybill) {
      throw new CarrierError(
        `delhivery: shipment creation failed${data.rmk ? ` (${data.rmk})` : ""}`,
        this.key,
        undefined,
        data,
      );
    }

    return {
      awb: String(pkg.waybill),
      courierKey: this.key,
      externalShipmentId: String(pkg.waybill),
      status: normalizeDelhiveryStatus(pkg.status) ?? ShipmentStatus.READY_TO_SHIP,
      rawStatus: pkg.status ?? "Manifested",
      cost: undefined,
      raw: data,
    };
  }

  async schedulePickup(input: PickupInput): Promise<PickupResult> {
    const payload = {
      pickup_location: this.pickupLocationName ?? input.address.name,
      pickup_date: input.pickupDate,
      pickup_time: "14:00:00",
      expected_package_count: 1,
    };
    const data = await httpJson<{ pickup_id?: string | number }>(
      this.fetchImpl,
      this.key,
      `${this.base}/fm/request/new/`,
      {
        method: "POST",
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    return {
      pickupId: data.pickup_id != null ? String(data.pickup_id) : undefined,
      scheduledFor: input.pickupDate,
      raw: data,
    };
  }

  async getLabel(input: LabelInput): Promise<LabelResult> {
    const url = `${this.base}/api/p/packing_slip?wbns=${encodeURIComponent(input.awb)}&pdf=true`;
    const data = await httpJson<{ packages?: Array<{ pdf_download_link?: string }> }>(
      this.fetchImpl,
      this.key,
      url,
      { headers: this.authHeaders() },
    );
    return { url: data.packages?.[0]?.pdf_download_link, raw: data };
  }

  async track(input: TrackInput): Promise<TrackingResult> {
    const url = `${this.base}/api/v1/packages/json/?waybill=${encodeURIComponent(input.awb)}`;
    const data = await httpJson<DelhiveryTrackResponse>(this.fetchImpl, this.key, url, {
      headers: this.authHeaders(),
    });

    const shipment = data.ShipmentData?.[0]?.Shipment;
    const current = shipment?.Status;
    const events = (shipment?.Scans ?? []).map((scan) => {
      const d = scan.ScanDetail;
      return {
        status: normalizeDelhiveryStatus(d?.Scan, d?.ScanType, d?.Instructions),
        rawStatus: d?.Scan ?? "",
        location: d?.ScannedLocation ?? undefined,
        message: d?.Instructions ?? undefined,
        occurredAt: d?.StatusDateTime ? new Date(d.StatusDateTime) : new Date(0),
      };
    });

    return {
      awb: input.awb,
      status: normalizeDelhiveryStatus(
        current?.Status,
        current?.StatusType,
        current?.Instructions,
      ),
      rawStatus: current?.Status ?? "",
      events,
      raw: data,
    };
  }

  async cancel(input: CancelInput): Promise<CancelResult> {
    const body = `format=json&data=${encodeURIComponent(
      JSON.stringify({ waybill: input.awb, cancellation: "true" }),
    )}`;
    const data = await httpJson<{ status?: boolean | string }>(
      this.fetchImpl,
      this.key,
      `${this.base}/api/p/edit`,
      {
        method: "POST",
        headers: {
          ...this.authHeaders(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    return { cancelled: data.status === true || data.status === "true", raw: data };
  }
}

// ── Response shapes (partial) ───────────────────────────────────────────────
interface DelhiveryCreateResponse {
  success?: boolean;
  rmk?: string;
  packages?: Array<{ waybill?: string | number; status?: string; refnum?: string }>;
}

interface DelhiveryTrackResponse {
  ShipmentData?: Array<{
    Shipment?: {
      Status?: {
        Status?: string;
        StatusType?: string;
        StatusLocation?: string;
        StatusDateTime?: string;
        Instructions?: string;
      };
      Scans?: Array<{
        ScanDetail?: {
          Scan?: string;
          ScanType?: string;
          ScannedLocation?: string;
          StatusDateTime?: string;
          Instructions?: string;
        };
      }>;
    };
  }>;
}
