import { DelhiveryAdapter } from "./delhivery";
import { ShiprocketAdapter } from "./shiprocket";
import type { AdapterContext, AdapterFactory, CarrierAdapter } from "./types";

/**
 * Adapter registry (CLAUDE.md §7). Resolves a CarrierAdapter by courierKey. App code
 * NEVER instantiates an adapter directly or special-cases a courier — it goes through
 * here. Phase 2 ships Delhivery + Shiprocket to prove the contract; Phase 6 adds the
 * remaining five with zero changes to call sites.
 */
const FACTORIES: Record<string, AdapterFactory> = {
  delhivery: (ctx) => new DelhiveryAdapter(ctx),
  shiprocket: (ctx) => new ShiprocketAdapter(ctx),
};

export interface CredentialField {
  name: string;
  label: string;
  type: "text" | "password";
  required: boolean;
  help?: string;
}

export interface CourierMeta {
  key: string;
  displayName: string;
  credentialFields: CredentialField[];
  /** Whether a separate sandbox endpoint exists for the per-merchant test-mode toggle. */
  hasSandbox: boolean;
}

/** Couriers connectable in the UI (Logistics Config). Grows as adapters are added. */
export const SUPPORTED_COURIERS: CourierMeta[] = [
  {
    key: "delhivery",
    displayName: "Delhivery",
    hasSandbox: true,
    credentialFields: [
      { name: "apiToken", label: "API Token", type: "password", required: true },
      {
        name: "pickupLocationName",
        label: "Registered pickup location name",
        type: "text",
        required: false,
        help: "Must match a warehouse name registered in your Delhivery account.",
      },
    ],
  },
  {
    key: "shiprocket",
    displayName: "Shiprocket",
    hasSandbox: false,
    credentialFields: [
      { name: "email", label: "API user email", type: "text", required: true },
      { name: "password", label: "API user password", type: "password", required: true },
      {
        name: "pickupLocation",
        label: "Pickup location nickname",
        type: "text",
        required: false,
        help: "The pickup nickname configured in your Shiprocket account.",
      },
    ],
  },
];

export function isSupportedCourier(courierKey: string): boolean {
  return courierKey in FACTORIES;
}

export function getCourierMeta(courierKey: string): CourierMeta | undefined {
  return SUPPORTED_COURIERS.find((c) => c.key === courierKey);
}

export function createAdapter(
  courierKey: string,
  ctx: AdapterContext,
): CarrierAdapter {
  const factory = FACTORIES[courierKey];
  if (!factory) {
    throw new Error(`Unknown courier: ${courierKey}`);
  }
  return factory(ctx);
}
