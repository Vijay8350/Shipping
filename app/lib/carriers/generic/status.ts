import { ShipmentStatus } from "@prisma/client";

/**
 * Shared canonical status normalizer (CLAUDE.md §6) used by the generic REST adapter for
 * the couriers added in Phase 6. Keyword-based over the common Indian-logistics status
 * vocabulary. Per-courier overrides can wrap this. Validate against each courier's real
 * status list before production (§14).
 */
export function normalizeGenericStatus(raw: string | null | undefined): ShipmentStatus {
  const s = (raw ?? "").toLowerCase();

  if (/rto.*deliver|return.*to.*origin.*deliver/.test(s)) return ShipmentStatus.RTO_DELIVERED;
  if (/rto|return to origin/.test(s)) return ShipmentStatus.RTO_INITIATED;
  if (/return.*receiv|return.*complete/.test(s)) return ShipmentStatus.RETURN_RECEIVED;
  if (/return/.test(s)) return ShipmentStatus.RETURN_INITIATED;
  if (/undeliver|not deliver|ndr|failed delivery|attempt failed/.test(s)) return ShipmentStatus.NDR;
  if (/out for delivery|ofd/.test(s)) return ShipmentStatus.OUT_FOR_DELIVERY;
  if (/delivered/.test(s)) return ShipmentStatus.DELIVERED;
  if (/cancel/.test(s)) return ShipmentStatus.CANCELLED;
  if (/in transit|in-transit|shipped|dispatch|departed|arrived|bagged/.test(s))
    return ShipmentStatus.IN_TRANSIT;
  if (/manifest|booked|pickup|ready|created|new/.test(s)) return ShipmentStatus.READY_TO_SHIP;

  return ShipmentStatus.IN_TRANSIT;
}
