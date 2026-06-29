import { describe, expect, it } from "vitest";
import { canTransition, isTerminalReturn } from "./returns-state";

describe("returns state machine (CLAUDE.md Phase 4)", () => {
  it("allows the happy path", () => {
    expect(canTransition("PENDING", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "IN_TRANSIT")).toBe(true);
    expect(canTransition("IN_TRANSIT", "RECEIVED")).toBe(true);
  });

  it("allows decline and cancel from the right states", () => {
    expect(canTransition("PENDING", "DECLINED")).toBe(true);
    expect(canTransition("APPROVED", "CANCELLED")).toBe(true);
    expect(canTransition("IN_TRANSIT", "CANCELLED")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("PENDING", "RECEIVED")).toBe(false);
    expect(canTransition("DECLINED", "APPROVED")).toBe(false);
    expect(canTransition("RECEIVED", "IN_TRANSIT")).toBe(false);
  });

  it("identifies terminal states", () => {
    expect(isTerminalReturn("RECEIVED")).toBe(true);
    expect(isTerminalReturn("DECLINED")).toBe(true);
    expect(isTerminalReturn("CANCELLED")).toBe(true);
    expect(isTerminalReturn("PENDING")).toBe(false);
  });
});
