/**
 * Returns lifecycle state machine (CLAUDE.md Phase 4). Pure + unit-tested. Flow:
 *   PENDING --accept--> APPROVED --reverse pickup--> IN_TRANSIT --> RECEIVED
 *   PENDING --decline--> DECLINED
 *   (PENDING/APPROVED/IN_TRANSIT) --cancel--> CANCELLED
 */
export const RETURN_STATES = [
  "PENDING",
  "APPROVED",
  "IN_TRANSIT",
  "RECEIVED",
  "DECLINED",
  "CANCELLED",
] as const;

export type ReturnState = (typeof RETURN_STATES)[number];

export const TERMINAL_RETURN_STATES: ReadonlySet<ReturnState> = new Set([
  "RECEIVED",
  "DECLINED",
  "CANCELLED",
]);

const TRANSITIONS: Record<ReturnState, ReturnState[]> = {
  PENDING: ["APPROVED", "DECLINED", "CANCELLED"],
  APPROVED: ["IN_TRANSIT", "RECEIVED", "CANCELLED"],
  IN_TRANSIT: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  DECLINED: [],
  CANCELLED: [],
};

export function canTransition(from: ReturnState, to: ReturnState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalReturn(state: ReturnState): boolean {
  return TERMINAL_RETURN_STATES.has(state);
}

export function assertTransition(from: ReturnState, to: ReturnState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid return transition: ${from} -> ${to}`);
  }
}
