/**
 * BullMQ queue names — the contract between the web process (enqueue) and the worker
 * process (consume). Pure constants, no imports, so both sides can share them without
 * coupling web and worker code (CLAUDE.md §4, §5).
 */
export const QUEUES = {
  /** Heavy webhook processing — order upserts, fulfillment sync, etc. (§9.4). */
  WEBHOOKS: "webhooks",
  /** One-shot recent-order backfill on install / first load (Phase 1). */
  ORDER_BACKFILL: "order-backfill",
  /** Repeatable cron that fans out tracking polls for active shipments (Phase 3, §5). */
  TRACKING_POLLER: "tracking-poller",
  /** Poll one shipment's courier and apply the result (Phase 3). */
  TRACKING_SHIPMENT: "tracking-shipment",
  /** Push a Fulfillment + tracking number/URL back to Shopify (Phase 3). */
  FULFILLMENT_SYNC: "fulfillment-sync",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Job payload shapes (shared types). */
export interface WebhookJob {
  topic: string;
  shop: string;
  payload: unknown;
}

export interface OrderBackfillJob {
  shop: string;
  /** How many recent orders to pull on backfill. */
  limit?: number;
}

export interface TrackShipmentJob {
  shipmentId: string;
}

export interface FulfillmentSyncJob {
  shipmentId: string;
}
