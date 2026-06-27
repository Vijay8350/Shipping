import { describe, expect, it } from "vitest";
import { isComplianceTopic, payloadHash, stableStringify } from "./webhooks.server";

describe("webhooks idempotency helpers (CLAUDE.md §9.4, §9.5)", () => {
  it("hashes identical payloads to the same digest regardless of key order", () => {
    const a = payloadHash("ORDERS_CREATE", { id: 1, name: "#1", email: "a@b.c" });
    const b = payloadHash("ORDERS_CREATE", { email: "a@b.c", name: "#1", id: 1 });
    expect(a).toBe(b);
  });

  it("produces different hashes for different topics or payloads", () => {
    const base = { id: 1 };
    expect(payloadHash("ORDERS_CREATE", base)).not.toBe(
      payloadHash("ORDERS_UPDATED", base),
    );
    expect(payloadHash("ORDERS_CREATE", { id: 1 })).not.toBe(
      payloadHash("ORDERS_CREATE", { id: 2 }),
    );
  });

  it("stableStringify sorts nested keys deterministically", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });

  it("recognizes the 3 mandatory compliance topics", () => {
    expect(isComplianceTopic("CUSTOMERS_DATA_REQUEST")).toBe(true);
    expect(isComplianceTopic("CUSTOMERS_REDACT")).toBe(true);
    expect(isComplianceTopic("SHOP_REDACT")).toBe(true);
    expect(isComplianceTopic("ORDERS_CREATE")).toBe(false);
  });
});
