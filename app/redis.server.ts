import IORedis, { type RedisOptions } from "ioredis";

// Shared Redis connection config (CLAUDE.md §4). The web process uses this to ENQUEUE
// BullMQ jobs; the worker process (worker/) uses the same config to consume them.
// BullMQ requires `maxRetriesPerRequest: null` on the connection it owns.
export const redisConnectionOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
};

export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set (see .env.example).");
  }
  return new IORedis(url, redisConnectionOptions);
}

// Lazily-created shared connection for the web process (enqueue side).
declare global {
  // eslint-disable-next-line no-var
  var __redis: IORedis | undefined;
}

const redis = global.__redis ?? createRedisConnection();

if (process.env.NODE_ENV !== "production") {
  global.__redis = redis;
}

export default redis;
