import type { Job } from "bullmq";
import { ShipmentStatus } from "@prisma/client";

import prisma from "../../app/db.server";
import {
  enqueueFulfillmentSync,
  enqueueNotification,
  enqueueTrackShipment,
} from "../../app/lib/queues.server";
import type { TrackShipmentJob } from "../../app/lib/queue-names";
import type { NotificationEvent } from "../../app/lib/notifications/types";
import { getAdapterForShop } from "../../app/services/courier-accounts.server";
import { applyTrackingResult, getActiveShipments, trackingUrl } from "../../app/services/tracking.server";

/** Canonical status -> customer notification event (CLAUDE.md §9.6). */
const STATUS_EVENT: Partial<Record<ShipmentStatus, NotificationEvent>> = {
  [ShipmentStatus.SHIPPED]: "ORDER_SHIPPED",
  [ShipmentStatus.OUT_FOR_DELIVERY]: "OUT_FOR_DELIVERY",
  [ShipmentStatus.DELIVERED]: "DELIVERED",
  [ShipmentStatus.NDR]: "NDR",
  [ShipmentStatus.RTO_INITIATED]: "RTO_INITIATED",
};

/**
 * Tracking poller (CLAUDE.md §5). The repeatable poll job fans out one TRACKING_SHIPMENT
 * job per active shipment — this gives natural per-job concurrency control + backoff and
 * keeps any single courier's rate limits contained. Runs in the worker, never the web
 * thread.
 */
export async function processTrackPoll(): Promise<void> {
  const active = await getActiveShipments(500);
  for (const s of active) {
    await enqueueTrackShipment({ shipmentId: s.id });
  }
  console.log(`[worker] tracking poll fanned out ${active.length} shipments`);
}

/** Statuses for which Shopify should have a fulfillment + tracking number. */
const FULFILLABLE = new Set<ShipmentStatus>([
  ShipmentStatus.SHIPPED,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERED,
]);

export async function processTrackShipment(job: Job<TrackShipmentJob>): Promise<void> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: job.data.shipmentId },
    include: {
      shop: { select: { shop: true } },
      order: { select: { name: true, customerName: true, email: true, phone: true } },
    },
  });
  if (!shipment) return;

  const adapter = await getAdapterForShop(shipment.shop.shop, shipment.courierKey);
  const result = await adapter.track({ awb: shipment.awb });
  const outcome = await applyTrackingResult(shipment.id, result);

  // Once moving, ensure Shopify has the fulfillment + tracking number (idempotent).
  if (!shipment.shopifyFulfillmentId && FULFILLABLE.has(outcome.newStatus)) {
    await enqueueFulfillmentSync({ shipmentId: shipment.id });
  }

  // Customer notification on a real status change (gated per template, §9.6).
  if (outcome.statusChanged) {
    const event = STATUS_EVENT[outcome.newStatus];
    if (event) {
      await enqueueNotification({
        shopId: shipment.shopId,
        event,
        recipientEmail: shipment.order.email,
        recipientPhone: shipment.order.phone,
        variables: {
          order_name: shipment.order.name,
          customer_name: shipment.order.customerName ?? "",
          awb: shipment.awb,
          courier: shipment.courierKey,
          tracking_url: trackingUrl(shipment.courierKey, shipment.awb) ?? "",
          status: outcome.newStatus,
        },
      });
    }
  }
}
