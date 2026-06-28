import type { Job } from "bullmq";

import type { FulfillmentSyncJob } from "../../app/lib/queue-names";
import { pushFulfillmentForShipment } from "../../app/services/fulfillment.server";

/** Push a shipment's fulfillment + tracking back to Shopify (CLAUDE.md §10, Phase 3). */
export async function processFulfillmentSync(job: Job<FulfillmentSyncJob>): Promise<void> {
  const res = await pushFulfillmentForShipment(job.data.shipmentId);
  if (!res.pushed) {
    console.log(`[worker] fulfillment skipped for ${job.data.shipmentId}: ${res.reason}`);
  }
}
