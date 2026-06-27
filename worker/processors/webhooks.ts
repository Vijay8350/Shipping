import type { Job } from "bullmq";

import type { WebhookJob } from "../../app/lib/queue-names";
import { mapRestOrder } from "../../app/lib/shopify/order-mapper";
import { upsertOrder } from "../../app/services/orders.server";

/**
 * Consume webhook jobs enqueued by the web endpoint (CLAUDE.md §5). Order webhooks ship
 * REST-shaped JSON, so we use mapRestOrder. Keep this in worker/ — separate from the
 * web process — so the worker can move to its own EC2 box later.
 */
export async function processWebhook(job: Job<WebhookJob>): Promise<void> {
  const { topic, shop, payload } = job.data;

  switch (topic) {
    case "ORDERS_CREATE":
    case "ORDERS_UPDATED":
    case "ORDERS_CANCELLED":
      await upsertOrder(shop, mapRestOrder(payload as never));
      break;

    case "FULFILLMENTS_CREATE":
      // Phase 3 pushes fulfillment + tracking back to Shopify. Nothing to persist yet.
      break;

    default:
      console.warn(`[worker] unhandled webhook topic: ${topic}`);
  }
}
