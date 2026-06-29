/**
 * Notification provider interface (CLAUDE.md §9.6). All email/SMS sends go through this
 * interface so MSG91 (SMS) + SES (email) can be dropped in later with ZERO call-site
 * changes. Phase 4 ships only the console stub.
 */
export type NotificationChannel = "email" | "sms";

export interface SendInput {
  channel: NotificationChannel;
  to: string;
  subject?: string; // email only
  body: string;
}

export interface SendResult {
  providerMsgId: string;
}

export interface NotificationProvider {
  readonly name: string;
  send(input: SendInput): Promise<SendResult>;
}

/** Notification event keys (CLAUDE.md Phase 4 — "order shipped, …, return accepted, etc."). */
export const NOTIFICATION_EVENTS = [
  "ORDER_SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "NDR",
  "RTO_INITIATED",
  "RETURN_ACCEPTED",
  "RETURN_RECEIVED",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const EVENT_LABELS: Record<NotificationEvent, string> = {
  ORDER_SHIPPED: "Order shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  NDR: "Delivery failed (NDR)",
  RTO_INITIATED: "Return to origin started",
  RETURN_ACCEPTED: "Return accepted",
  RETURN_RECEIVED: "Return received",
};
