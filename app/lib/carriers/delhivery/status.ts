import { ShipmentStatus } from "@prisma/client";

/**
 * Normalize Delhivery raw statuses into our canonical set (CLAUDE.md §6). Delhivery
 * exposes a `Status` plus a `StatusType` (e.g. UD = undelivered, RT = return) and free-
 * text `Instructions`; we keyword-match across them. Unknown in-network states fall back
 * to IN_TRANSIT. NOTE: validate against live Delhivery responses before production (§14).
 */
export function normalizeDelhiveryStatus(
  status: string | null | undefined,
  statusType?: string | null,
  instructions?: string | null,
): ShipmentStatus {
  const s = `${status ?? ""} ${statusType ?? ""} ${instructions ?? ""}`.toLowerCase();

  if (/\bdelivered\b/.test(s) && /rto|return/.test(s)) return ShipmentStatus.RTO_DELIVERED;
  if (/\bdelivered\b/.test(s)) return ShipmentStatus.DELIVERED;
  if (/rto/.test(s) && /(initiat|in\s*transit|progress)/.test(s))
    return ShipmentStatus.RTO_INITIATED;
  if (/rto/.test(s)) return ShipmentStatus.RTO_INITIATED;
  if (/cancel/.test(s)) return ShipmentStatus.CANCELLED;
  if (/out for delivery|dispatched|ofd/.test(s)) return ShipmentStatus.OUT_FOR_DELIVERY;
  // NDR is signalled by Status text / Instructions — NOT the StatusType "UD" code, which
  // Delhivery uses for normal undelivered-in-transit consignments.
  if (/undelivered|ndr|not attempted|consignee|reschedul|refused|address issue/.test(s))
    return ShipmentStatus.NDR;
  if (/manifest|not picked|pickup scheduled|pending pickup/.test(s))
    return ShipmentStatus.READY_TO_SHIP;
  if (/picked|in[\s-]?transit|in transit|dispatch|pending|bagged|received/.test(s))
    return ShipmentStatus.IN_TRANSIT;

  return ShipmentStatus.IN_TRANSIT;
}
