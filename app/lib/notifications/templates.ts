import type { NotificationChannel, NotificationEvent } from "./types";

/**
 * Default templates + variable rendering (pure, unit-tested). DB rows
 * (NotificationTemplate) override these per shop; if no row exists the default applies.
 * Variables use {{snake_case}} placeholders.
 */

export interface TemplateDef {
  subject?: string;
  body: string;
  enabled: boolean;
}

export const TEMPLATE_VARIABLES = [
  "order_name",
  "customer_name",
  "awb",
  "courier",
  "tracking_url",
  "status",
] as const;

export const DEFAULT_TEMPLATES: Record<
  NotificationEvent,
  Record<NotificationChannel, TemplateDef>
> = {
  ORDER_SHIPPED: {
    email: {
      subject: "Your order {{order_name}} has shipped",
      body: "Hi {{customer_name}}, your order {{order_name}} is on its way via {{courier}}. Track it here: {{tracking_url}} (AWB {{awb}}).",
      enabled: true,
    },
    sms: {
      body: "{{order_name}} shipped via {{courier}}. Track: {{tracking_url}}",
      enabled: true,
    },
  },
  OUT_FOR_DELIVERY: {
    email: {
      subject: "Your order {{order_name}} is out for delivery",
      body: "Hi {{customer_name}}, your order {{order_name}} is out for delivery today.",
      enabled: true,
    },
    sms: { body: "{{order_name}} is out for delivery today.", enabled: true },
  },
  DELIVERED: {
    email: {
      subject: "Your order {{order_name}} was delivered",
      body: "Hi {{customer_name}}, your order {{order_name}} has been delivered. Thank you!",
      enabled: true,
    },
    sms: { body: "{{order_name}} delivered. Thank you!", enabled: true },
  },
  NDR: {
    email: {
      subject: "We could not deliver {{order_name}}",
      body: "Hi {{customer_name}}, delivery of {{order_name}} failed. We will re-attempt shortly.",
      enabled: true,
    },
    sms: { body: "Delivery of {{order_name}} failed; re-attempt soon.", enabled: false },
  },
  RTO_INITIATED: {
    email: {
      subject: "Your order {{order_name}} is being returned",
      body: "Hi {{customer_name}}, {{order_name}} is being returned to the sender.",
      enabled: false,
    },
    sms: { body: "{{order_name}} is being returned to sender.", enabled: false },
  },
  RETURN_ACCEPTED: {
    email: {
      subject: "Your return for {{order_name}} is accepted",
      body: "Hi {{customer_name}}, your return for {{order_name}} is accepted. Reverse pickup AWB: {{awb}}.",
      enabled: true,
    },
    sms: { body: "Return for {{order_name}} accepted. Pickup AWB {{awb}}.", enabled: false },
  },
  RETURN_RECEIVED: {
    email: {
      subject: "We received your return for {{order_name}}",
      body: "Hi {{customer_name}}, we have received your returned items for {{order_name}}.",
      enabled: true,
    },
    sms: { body: "Return for {{order_name}} received.", enabled: false },
  },
};

export function renderTemplate(
  template: string,
  variables: Record<string, string | undefined>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => variables[key] ?? "");
}

export function defaultTemplate(
  event: NotificationEvent,
  channel: NotificationChannel,
): TemplateDef {
  return DEFAULT_TEMPLATES[event][channel];
}
