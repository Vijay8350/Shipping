import crypto from "node:crypto";

/**
 * Deterministic hash of a webhook payload for idempotency/dedupe (CLAUDE.md §9.4).
 * A repeated delivery of the same (topic, payloadHash) is ignored via the unique
 * constraint on WebhookLog(topic, payloadHash).
 */
export function payloadHash(topic: string, payload: unknown): string {
  const body = typeof payload === "string" ? payload : stableStringify(payload);
  return crypto.createHash("sha256").update(`${topic}:${body}`).digest("hex");
}

/** JSON.stringify with sorted keys so equal objects hash identically. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Shopify compliance topics (CLAUDE.md §9.5) — handled inline, never enqueued. */
export const COMPLIANCE_TOPICS = new Set([
  "CUSTOMERS_DATA_REQUEST",
  "CUSTOMERS_REDACT",
  "SHOP_REDACT",
]);

export function isComplianceTopic(topic: string): boolean {
  return COMPLIANCE_TOPICS.has(topic);
}
