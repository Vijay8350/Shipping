import type { ShipmentStatus } from "@prisma/client";

/**
 * The Carrier Adapter contract (CLAUDE.md §7) — the heart of the app. EVERY courier
 * implements this same interface; app code never special-cases a courier outside its
 * adapter. Adapters read credentials from the encrypted CourierAccount (§9.3), honor a
 * per-merchant test-mode toggle (§7), and normalize raw status into the canonical set
 * (§6, store BOTH raw and normalized).
 *
 * `fetchImpl` is injectable so adapters are unit-tested against recorded fixtures with no
 * network (CLAUDE.md §7: "ships with a unit test against recorded fixture responses").
 */

export interface Address {
  name: string;
  phone: string;
  email?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string; // defaults to India
}

export interface Parcel {
  weightGrams: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

export interface ShipmentItem {
  name: string;
  sku?: string;
  quantity: number;
  price: number; // minor units (§11)
}

// ── Method I/O ──────────────────────────────────────────────────────────────
export interface ServiceabilityInput {
  fromPincode: string;
  toPincode: string;
  weightGrams: number;
  cod: boolean;
  declaredValue?: number; // minor units
}

export interface ServiceabilityOption {
  courierName?: string;
  courierId?: string | number; // courier-side id (Shiprocket needs this to assign AWB)
  serviceType?: string;
  etaDays?: number;
  rate?: number; // minor units
}

export interface ServiceabilityResult {
  serviceable: boolean;
  options: ServiceabilityOption[];
  raw: unknown;
}

export interface CreateShipmentInput {
  orderName: string;
  /** Our stable reference (order id) — also the idempotency seed (§9.1). */
  reference: string;
  pickup: Address;
  delivery: Address;
  parcel: Parcel;
  cod: boolean;
  codAmount?: number; // minor units
  declaredValue: number; // minor units
  items: ShipmentItem[];
  serviceType?: string;
  /** Courier-side service id chosen from serviceability (Shiprocket). */
  courierId?: string | number;
}

export interface ShipmentResult {
  awb: string;
  courierKey: string;
  /** Courier-side shipment/order id, needed by some couriers for label/pickup/cancel. */
  externalShipmentId?: string;
  status: ShipmentStatus; // canonical (§6)
  rawStatus?: string;
  labelUrl?: string; // courier-hosted label, if provided
  cost?: number; // minor units
  raw: unknown;
}

export interface PickupInput {
  awb?: string;
  externalShipmentId?: string;
  pickupDate?: string; // YYYY-MM-DD
  address: Address;
}

export interface PickupResult {
  pickupId?: string;
  scheduledFor?: string;
  raw: unknown;
}

export interface LabelInput {
  awb: string;
  externalShipmentId?: string;
}

export interface LabelResult {
  /** A courier-hosted URL and/or raw bytes, when the courier provides one. */
  url?: string;
  pdf?: Buffer;
  raw: unknown;
}

export interface TrackInput {
  awb: string;
}

export interface TrackingEventResult {
  status: ShipmentStatus; // canonical (§6)
  rawStatus: string;
  location?: string;
  message?: string;
  occurredAt: Date;
}

export interface TrackingResult {
  awb: string;
  status: ShipmentStatus; // canonical, latest
  rawStatus: string;
  events: TrackingEventResult[];
  raw: unknown;
}

export interface CancelInput {
  awb: string;
  externalShipmentId?: string;
}

export interface CancelResult {
  cancelled: boolean;
  raw: unknown;
}

// ── The contract ────────────────────────────────────────────────────────────
export interface CarrierAdapter {
  readonly key: string;
  readonly displayName: string;
  checkServiceability(input: ServiceabilityInput): Promise<ServiceabilityResult>;
  createShipment(input: CreateShipmentInput): Promise<ShipmentResult>; // returns AWB
  schedulePickup(input: PickupInput): Promise<PickupResult>;
  getLabel(input: LabelInput): Promise<LabelResult>;
  track(input: TrackInput): Promise<TrackingResult>; // raw + normalized
  cancel(input: CancelInput): Promise<CancelResult>;
}

export type FetchImpl = typeof fetch;

/** Runtime context handed to an adapter on construction. Credentials are already
 *  DECRYPTED by the caller (courier-account service) — adapters never touch the DB. */
export interface AdapterContext {
  credentials: Record<string, unknown>;
  testMode: boolean;
  /** Injectable for tests; defaults to global fetch in the registry. */
  fetchImpl?: FetchImpl;
}

export type AdapterFactory = (ctx: AdapterContext) => CarrierAdapter;

/** Thrown by adapters on any courier-side failure. Never include secrets in `message`. */
export class CarrierError extends Error {
  constructor(
    message: string,
    readonly courierKey: string,
    readonly status?: number,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = "CarrierError";
  }
}
