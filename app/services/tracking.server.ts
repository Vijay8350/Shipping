import { ShipmentStatus } from "@prisma/client";

import prisma from "../db.server";
import type { TrackingEventResult, TrackingResult } from "../lib/carriers/types";

/**
 * Tracking application logic (CLAUDE.md §5, §6). The worker polls each active shipment's
 * adapter.track(), then this service writes new TrackingEvents and advances the canonical
 * Shipment.status. Pure helpers (terminal set, tracking URL, event dedupe) are unit-tested.
 */

/** A shipment in one of these no longer needs polling. */
export const TERMINAL_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  ShipmentStatus.DELIVERED,
  ShipmentStatus.RTO_DELIVERED,
  ShipmentStatus.CANCELLED,
  ShipmentStatus.RETURN_RECEIVED,
]);

export function isTerminal(status: ShipmentStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Customer-facing courier tracking URL (used for Shopify fulfillment + tracking page). */
export function trackingUrl(courierKey: string, awb: string): string | undefined {
  switch (courierKey) {
    case "delhivery":
      return `https://www.delhivery.com/track/package/${encodeURIComponent(awb)}`;
    case "shiprocket":
      return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
    default:
      return undefined;
  }
}

export function eventKey(e: { occurredAt: Date; rawStatus: string; status: ShipmentStatus }): string {
  return `${e.occurredAt.getTime()}|${e.rawStatus}|${e.status}`;
}

/** Pure: which incoming events are new vs. what we've already stored. */
export function diffNewEvents(
  existingKeys: Set<string>,
  events: TrackingEventResult[],
): TrackingEventResult[] {
  const seen = new Set(existingKeys);
  const fresh: TrackingEventResult[] = [];
  for (const e of events) {
    const k = eventKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    fresh.push(e);
  }
  return fresh;
}

export interface ApplyTrackingOutcome {
  statusChanged: boolean;
  insertedEvents: number;
  newStatus: ShipmentStatus;
}

/**
 * Persist a tracking poll: insert any new events and advance the canonical status.
 * Returns what changed so the caller can decide whether to push fulfillment to Shopify.
 */
export async function applyTrackingResult(
  shipmentId: string,
  result: TrackingResult,
): Promise<ApplyTrackingOutcome> {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new Error("Shipment not found");

  const existing = await prisma.trackingEvent.findMany({
    where: { shipmentId },
    select: { occurredAt: true, rawStatus: true, status: true },
  });
  const existingKeys = new Set(
    existing.map((e) => eventKey({ occurredAt: e.occurredAt, rawStatus: e.rawStatus ?? "", status: e.status })),
  );

  const fresh = diffNewEvents(existingKeys, result.events);
  if (fresh.length > 0) {
    await prisma.trackingEvent.createMany({
      data: fresh.map((e) => ({
        shipmentId,
        status: e.status,
        rawStatus: e.rawStatus,
        location: e.location,
        message: e.message,
        occurredAt: e.occurredAt,
      })),
    });
  }

  const statusChanged = shipment.status !== result.status;
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      status: result.status,
      rawStatus: result.rawStatus,
      lastTrackedAt: new Date(),
      ...(result.status === ShipmentStatus.DELIVERED && !shipment.deliveredAt
        ? { deliveredAt: new Date() }
        : {}),
    },
  });

  return { statusChanged, insertedEvents: fresh.length, newStatus: result.status };
}

/** Active (non-terminal) shipments for the poller, oldest-polled first. */
export async function getActiveShipments(limit = 500) {
  return prisma.shipment.findMany({
    where: { status: { notIn: Array.from(TERMINAL_STATUSES) } },
    orderBy: [{ lastTrackedAt: { sort: "asc", nulls: "first" } }],
    take: limit,
    include: { shop: { select: { shop: true } } },
  });
}
