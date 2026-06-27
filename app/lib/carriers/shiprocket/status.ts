import { ShipmentStatus } from "@prisma/client";

/**
 * Normalize Shiprocket raw statuses into our canonical set (CLAUDE.md §6). Shiprocket
 * returns a textual `shipment_status` / activity status; we keyword-match. Validate
 * against live responses before production (§14).
 */
export function normalizeShiprocketStatus(
  status: string | null | undefined,
): ShipmentStatus {
  const s = (status ?? "").toLowerCase();

  if (/rto.*deliver/.test(s)) return ShipmentStatus.RTO_DELIVERED;
  if (/rto/.test(s)) return ShipmentStatus.RTO_INITIATED;
  if (/return.*deliver|return received|return.*complete/.test(s))
    return ShipmentStatus.RETURN_RECEIVED;
  if (/return/.test(s)) return ShipmentStatus.RETURN_INITIATED;
  // Check undelivered/NDR BEFORE delivered (so "Undelivered"/"Not Delivered" don't match
  // the "delivered" substring).
  if (/undelivered|ndr|not delivered/.test(s)) return ShipmentStatus.NDR;
  if (/out for delivery|ofd/.test(s)) return ShipmentStatus.OUT_FOR_DELIVERY;
  if (/delivered/.test(s)) return ShipmentStatus.DELIVERED;
  if (/cancel/.test(s)) return ShipmentStatus.CANCELLED;
  if (/in transit|shipped|in-transit/.test(s)) return ShipmentStatus.IN_TRANSIT;
  if (/pickup|manifest|awb assigned|ready|new|order placed/.test(s))
    return ShipmentStatus.READY_TO_SHIP;

  return ShipmentStatus.IN_TRANSIT;
}
