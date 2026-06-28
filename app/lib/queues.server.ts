import { Queue } from "bullmq";

import redis from "../redis.server";
import {
  QUEUES,
  type FulfillmentSyncJob,
  type OrderBackfillJob,
  type TrackShipmentJob,
  type WebhookJob,
} from "./queue-names";

/**
 * Enqueue-side BullMQ queues used by the WEB process (CLAUDE.md §5: heavy/slow work
 * never runs in a request — it is enqueued here and consumed by the worker process).
 * Reuse the shared Redis connection (app/redis.server.ts).
 */

declare global {
  // eslint-disable-next-line no-var
  var __queues: Record<string, Queue> | undefined;
}

function getQueue(name: string): Queue {
  const cache = (global.__queues ??= {});
  cache[name] ??= new Queue(name, { connection: redis });
  return cache[name];
}

const defaultJobOpts = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export function enqueueWebhook(job: WebhookJob) {
  return getQueue(QUEUES.WEBHOOKS).add(job.topic, job, defaultJobOpts);
}

export function enqueueOrderBackfill(job: OrderBackfillJob) {
  // Coalesce repeat backfills for the same shop via a stable jobId.
  return getQueue(QUEUES.ORDER_BACKFILL).add("backfill", job, {
    ...defaultJobOpts,
    jobId: `backfill:${job.shop}`,
  });
}

export function enqueueTrackShipment(job: TrackShipmentJob) {
  // Coalesce concurrent track requests for the same shipment.
  return getQueue(QUEUES.TRACKING_SHIPMENT).add("track", job, {
    ...defaultJobOpts,
    jobId: `track:${job.shipmentId}`,
  });
}

export function enqueueFulfillmentSync(job: FulfillmentSyncJob) {
  return getQueue(QUEUES.FULFILLMENT_SYNC).add("fulfill", job, {
    ...defaultJobOpts,
    jobId: `fulfill:${job.shipmentId}`,
  });
}
