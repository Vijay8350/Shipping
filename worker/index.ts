import "dotenv/config";
import { createWorkerRedis } from "./connection";

/**
 * BullMQ worker bootstrap (CLAUDE.md §5). Phase 0 has NO jobs yet — this process just
 * connects to Redis and stays alive so the PM2 `worker` process is real and the wiring
 * is proven. Phases 1+ add: tracking poller (cron), status normalization, notification
 * dispatcher, automation rules, usage metering, heavy webhook processing.
 */
async function main() {
  const connection = createWorkerRedis();

  connection.on("connect", () => console.log("[worker] redis connected"));
  connection.on("error", (err) => console.error("[worker] redis error:", err.message));

  // Wait for the connection to be ready before declaring ourselves up.
  await connection.ping();
  console.log("worker up");

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, shutting down`);
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
