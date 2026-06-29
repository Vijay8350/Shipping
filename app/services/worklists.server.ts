import { ShipmentStatus } from "@prisma/client";

import prisma from "../db.server";
import { enqueueNotification } from "../lib/queues.server";

/**
 * NDR + RTO worklists (CLAUDE.md Phase 4 items 1–2). NDR/RTO states are detected by the
 * tracking poller (which normalizes courier statuses, §6); these are the admin views and
 * actions over shipments already in those states.
 */

async function getShopId(shopDomain: string): Promise<string> {
  const shop = await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { id: true } });
  if (!shop) throw new Error(`No Shop row for ${shopDomain}`);
  return shop.id;
}

export async function listNdrShipments(shopDomain: string) {
  return prisma.shipment.findMany({
    where: { shop: { shop: shopDomain }, status: ShipmentStatus.NDR },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { order: { select: { id: true, name: true, customerName: true, shippingCity: true } } },
  });
}

export async function listRtoShipments(shopDomain: string) {
  return prisma.shipment.findMany({
    where: {
      shop: { shop: shopDomain },
      status: { in: [ShipmentStatus.RTO_INITIATED, ShipmentStatus.RTO_DELIVERED] },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { order: { select: { id: true, name: true, customerName: true, shippingCity: true } } },
  });
}

export type NdrAction = "reattempt" | "rto";

/**
 * Record an NDR action and log the outcome (CLAUDE.md Phase 4 item 1). The adapter
 * contract has no NDR-specific endpoint, so a re-attempt is recorded + the customer is
 * re-notified; "rto" moves the shipment to RTO_INITIATED. Both log a TrackingEvent.
 */
export async function recordNdrAction(
  shopDomain: string,
  shipmentId: string,
  action: NdrAction,
) {
  const shopId = await getShopId(shopDomain);
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, shop: { shop: shopDomain } },
    include: { order: { select: { name: true, customerName: true, email: true, phone: true } } },
  });
  if (!shipment) throw new Error("Shipment not found");

  const newStatus = action === "rto" ? ShipmentStatus.RTO_INITIATED : shipment.status;

  await prisma.$transaction([
    prisma.trackingEvent.create({
      data: {
        shipmentId: shipment.id,
        status: newStatus,
        rawStatus: `NDR action: ${action}`,
        message: action === "rto" ? "Marked for return to origin" : "Re-attempt requested",
        occurredAt: new Date(),
      },
    }),
    prisma.shipment.update({ where: { id: shipment.id }, data: { status: newStatus } }),
  ]);

  if (action === "reattempt") {
    await enqueueNotification({
      shopId,
      event: "NDR",
      recipientEmail: shipment.order.email,
      recipientPhone: shipment.order.phone,
      variables: {
        order_name: shipment.order.name,
        customer_name: shipment.order.customerName ?? "",
        awb: shipment.awb,
        courier: shipment.courierKey,
      },
    });
  }
}
