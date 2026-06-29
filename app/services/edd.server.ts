import prisma from "../db.server";
import { eddRange, type EddRange } from "../lib/edd";
import { getAdapterForShop } from "./courier-accounts.server";
import { getDefaultPickupAddress } from "./pickup-addresses.server";
import { getStorefrontConfig } from "./storefront-settings.server";

/**
 * Compute an estimated delivery date for a destination pincode (CLAUDE.md §10). Driven by
 * courier serviceability (the courier's own ETA when available) and the merchant's
 * configured transit-time window as a fallback.
 */
export interface EddResult {
  serviceable: boolean;
  courier?: string;
  range?: EddRange;
}

export async function computeEdd(
  shopDomain: string,
  toPincode: string,
  courierKeyOverride?: string,
): Promise<EddResult> {
  const config = await getStorefrontConfig(shopDomain);
  if (!config.eddEnabled) return { serviceable: false };

  const pickup = await getDefaultPickupAddress(shopDomain);
  if (!pickup) return { serviceable: false };

  // Pick the courier to quote: override, else first enabled courier.
  const courierKey =
    courierKeyOverride ??
    (
      await prisma.courierAccount.findFirst({
        where: { shop: { shop: shopDomain }, enabled: true },
        select: { courierKey: true },
      })
    )?.courierKey;
  if (!courierKey) return { serviceable: false };

  try {
    const adapter = await getAdapterForShop(shopDomain, courierKey);
    const svc = await adapter.checkServiceability({
      fromPincode: pickup.pincode,
      toPincode,
      weightGrams: 500,
      cod: false,
    });
    if (!svc.serviceable) return { serviceable: false, courier: courierKey };

    const eta = svc.options.find((o) => o.etaDays)?.etaDays;
    const minDays = eta ?? config.eddMinDays;
    const maxDays = eta ? eta : config.eddMaxDays;
    return {
      serviceable: true,
      courier: courierKey,
      range: eddRange(new Date(), minDays, maxDays),
    };
  } catch {
    // Network/courier failure -> fall back to the configured window (still useful UX).
    return {
      serviceable: true,
      courier: courierKey,
      range: eddRange(new Date(), config.eddMinDays, config.eddMaxDays),
    };
  }
}
