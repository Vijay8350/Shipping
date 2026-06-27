import { describe, expect, it } from "vitest";
import { idempotencyKeyFor } from "./shipping.server";

describe("ship idempotency key (CLAUDE.md §9.1)", () => {
  it("is deterministic per (order + courier)", () => {
    expect(idempotencyKeyFor("order_1", "delhivery")).toBe("order_1:delhivery");
    expect(idempotencyKeyFor("order_1", "delhivery")).toBe(
      idempotencyKeyFor("order_1", "delhivery"),
    );
  });

  it("differs by courier and by order", () => {
    expect(idempotencyKeyFor("order_1", "delhivery")).not.toBe(
      idempotencyKeyFor("order_1", "shiprocket"),
    );
    expect(idempotencyKeyFor("order_1", "delhivery")).not.toBe(
      idempotencyKeyFor("order_2", "delhivery"),
    );
  });
});
