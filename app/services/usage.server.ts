import prisma from "../db.server";

/**
 * Usage metering (CLAUDE.md §9.2). Every billable shipment writes a UsageRecord from day
 * one. Shopify usage emission (appUsageRecordCreate) is wired in Phase 6 — this just
 * records the billable event. Idempotent per shipment so a retried ship never
 * double-meters (§9.1).
 */
export async function recordShipmentUsage(
  shopId: string,
  shipmentId: string,
): Promise<void> {
  const existing = await prisma.usageRecord.findFirst({ where: { shipmentId } });
  if (existing) return;
  await prisma.usageRecord.create({
    data: { shopId, shipmentId, billed: false, currency: "USD" },
  });
}
