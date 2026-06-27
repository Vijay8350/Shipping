import type { Job } from "bullmq";

import type { OrderBackfillJob } from "../../app/lib/queue-names";
import { backfillOrders } from "../../app/services/orders.server";

/** Consume order-backfill jobs (Phase 1). Pulls recent orders via the GraphQL Admin API. */
export async function processBackfill(job: Job<OrderBackfillJob>): Promise<void> {
  const { shop, limit } = job.data;
  const count = await backfillOrders(shop, limit ?? 100);
  console.log(`[worker] backfilled ${count} orders for ${shop}`);
}
