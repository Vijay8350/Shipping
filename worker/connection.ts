import "dotenv/config";
import IORedis from "ioredis";

/**
 * Worker-side Redis connection (CLAUDE.md §4, §5). Kept in worker/ — separate from the
 * web process — so the worker can move to its own EC2 box later with zero code change.
 * Same REDIS_URL / connection options as the web side (app/redis.server.ts).
 */
export function createWorkerRedis(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set (see .env.example).");
  }
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

// Queue names are shared via app/lib/queue-names.ts (imported by both web and worker).
