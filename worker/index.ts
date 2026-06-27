import "dotenv/config";
import { Worker } from "bullmq";

import { QUEUES } from "../app/lib/queue-names";
import { createWorkerRedis } from "./connection";
import { processBackfill } from "./processors/backfill";
import { processWebhook } from "./processors/webhooks";

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
  ];

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
