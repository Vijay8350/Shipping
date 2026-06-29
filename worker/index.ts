import "dotenv/config";
import { Queue, Worker } from "bullmq";

import { QUEUES } from "../app/lib/queue-names";
import { createWorkerRedis } from "./connection";
import { processBackfill } from "./processors/backfill";
import { processFulfillmentSync } from "./processors/fulfillment";
import { processNotification } from "./processors/notifications";
import { processTrackPoll, processTrackShipment } from "./processors/tracking";
import { processWebhook } from "./processors/webhooks";

/** How often the tracking poller runs (CLAUDE.md §5). */
const TRACKING_INTERVAL_MS = Number(process.env.TRACKING_INTERVAL_MS || 15 * 60 * 1000);

/**
 * BullMQ worker process (CLAUDE.md §5). Consumes jobs the web process enqueues. Phase 1
 * runs two queues: heavy webhook processing and the order backfill. Later phases add the
 * tracking poller (cron), notification dispatcher, automation rules, and usage metering.
 */
async function main() {
  const connection = createWorkerRedis();
  connection.on("connect", () => console.log("[worker] redis connected"));
  connection.on("error", (err) => console.error("[worker] redis error:", err.message));
  await connection.ping();

  const workers = [
    new Worker(QUEUES.WEBHOOKS, processWebhook, { connection, concurrency: 5 }),
    new Worker(QUEUES.ORDER_BACKFILL, processBackfill, { connection, concurrency: 2 }),
    new Worker(QUEUES.TRACKING_POLLER, processTrackPoll, { connection, concurrency: 1 }),
    // Modest concurrency keeps within courier rate limits; jobs back off on failure.
    new Worker(QUEUES.TRACKING_SHIPMENT, processTrackShipment, { connection, concurrency: 4 }),
    new Worker(QUEUES.FULFILLMENT_SYNC, processFulfillmentSync, { connection, concurrency: 3 }),
    new Worker(QUEUES.NOTIFICATIONS, processNotification, { connection, concurrency: 5 }),
  ];

  // Schedule the repeatable tracking poll (idempotent by scheduler id).
  const pollerQueue = new Queue(QUEUES.TRACKING_POLLER, { connection });
  await pollerQueue.upsertJobScheduler(
    "tracking-poll",
    { every: TRACKING_INTERVAL_MS },
    { name: "poll" },
  );
  console.log(`[worker] tracking poll scheduled every ${TRACKING_INTERVAL_MS}ms`);

  for (const w of workers) {
    w.on("failed", (job, err) =>
      console.error(`[worker] ${w.name} job ${job?.id} failed:`, err.message),
    );
  }

  console.log("worker up");

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, shutting down`);
    await Promise.allSettled(workers.map((w) => w.close()));
    await connection.quit();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
