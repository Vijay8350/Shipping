import type { Job } from "bullmq";

import type { WebhookJob } from "../../app/lib/queue-names";
import { mapRestOrder } from "../../app/lib/shopify/order-mapper";
import { upsertOrder } from "../../app/services/orders.server";
import { applyAutomation } from "../../app/services/automation.server";

/**
 * Consume webhook jobs enqueued by the web endpoint (CLAUDE.md §5). Order webhooks ship
 * REST-shaped JSON, so we use mapRestOrder. Automation rules run here after the order is
 * persisted (auto-ship reuses the idempotent ship workflow, so repeats are safe).
 */
export async function processWebhook(job: Job<WebhookJob>): Promise<void> {
  const { topic, shop, payload } = job.data;

  switch (topic) {
    case "ORDERS_CREATE": {
      const order = await upsertOrder(shop, mapRestOrder(payload as never));
      await applyAutomation(shop, order.id, "order_created");
      break;
    }
    case "ORDERS_UPDATED": {
      const data = mapRestOrder(payload as never);
      const order = await upsertOrder(shop, data);
      if (data.financialStatus === "paid") {
        await applyAutomation(shop, order.id, "order_paid");
      }
      break;
    }
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
