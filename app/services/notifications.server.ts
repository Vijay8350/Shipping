import prisma from "../db.server";
import { getNotificationProvider } from "../lib/notifications/provider";
import {
  defaultTemplate,
  renderTemplate,
  DEFAULT_TEMPLATES,
} from "../lib/notifications/templates";
import {
  NOTIFICATION_EVENTS,
  type NotificationChannel,
  type NotificationEvent,
} from "../lib/notifications/types";

/**
 * Notification dispatch + template management (CLAUDE.md §9.6). Every send routes through
 * the provider interface and writes a NotificationLog. Templates gate which events fire:
 * a disabled template means the event simply does not send on that channel.
 */

async function getShopId(shopDomain: string): Promise<string> {
  const shop = await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { id: true } });
  if (!shop) throw new Error(`No Shop row for ${shopDomain}`);
  return shop.id;
}

export interface DispatchInput {
  shopId: string;
  event: NotificationEvent;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  variables: Record<string, string | undefined>;
}

interface ResolvedTemplate {
  subject?: string | null;
  body: string;
  enabled: boolean;
}

/** Resolve the effective template (DB override or built-in default) for event×channel. */
async function resolveTemplate(
  shopId: string,
  event: NotificationEvent,
  channel: NotificationChannel,
): Promise<ResolvedTemplate> {
  const row = await prisma.notificationTemplate.findUnique({
    where: { shopId_event_channel: { shopId, event, channel } },
  });
  if (row) return { subject: row.subject, body: row.body, enabled: row.enabled };
  const def = defaultTemplate(event, channel);
  return { subject: def.subject, body: def.body, enabled: def.enabled };
}

/**
 * Send the configured channels for an event. Runs in the worker (notification
 * dispatcher, §5). Returns how many messages were actually sent.
 */
export async function dispatchNotification(input: DispatchInput): Promise<number> {
  const provider = getNotificationProvider();
  const channels: Array<{ channel: NotificationChannel; to: string | null | undefined }> = [
    { channel: "email", to: input.recipientEmail },
    { channel: "sms", to: input.recipientPhone },
  ];

  let sent = 0;
  for (const { channel, to } of channels) {
    const template = await resolveTemplate(input.shopId, input.event, channel);
    if (!template.enabled) continue; // gated off
    if (!to) continue; // no recipient for this channel

    const subject = template.subject ? renderTemplate(template.subject, input.variables) : undefined;
    const body = renderTemplate(template.body, input.variables);

    try {
      const res = await provider.send({ channel, to, subject, body });
      await prisma.notificationLog.create({
        data: {
          shopId: input.shopId,
          channel,
          template: input.event,
          recipient: to,
          status: "sent",
          providerMsgId: res.providerMsgId,
          sentAt: new Date(),
        },
      });
      sent += 1;
    } catch (err) {
      await prisma.notificationLog.create({
        data: {
          shopId: input.shopId,
          channel,
          template: input.event,
          recipient: to,
          status: "failed",
          error: (err as Error).message,
        },
      });
    }
  }
  return sent;
}

// ── Template management (Notifications screen) ──────────────────────────────
export interface TemplateRow {
  event: NotificationEvent;
  channel: NotificationChannel;
  subject: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
}

export async function listTemplates(shopDomain: string): Promise<TemplateRow[]> {
  const shopId = await getShopId(shopDomain);
  const rows = await prisma.notificationTemplate.findMany({ where: { shopId } });
  const byKey = new Map(rows.map((r) => [`${r.event}:${r.channel}`, r]));

  const result: TemplateRow[] = [];
  for (const event of NOTIFICATION_EVENTS) {
    for (const channel of ["email", "sms"] as NotificationChannel[]) {
      const row = byKey.get(`${event}:${channel}`);
      const def = DEFAULT_TEMPLATES[event][channel];
      result.push({
        event,
        channel,
        subject: row?.subject ?? def.subject ?? "",
        body: row?.body ?? def.body,
        enabled: row?.enabled ?? def.enabled,
        isDefault: !row,
      });
    }
  }
  return result;
}

export async function upsertTemplate(
  shopDomain: string,
  event: NotificationEvent,
  channel: NotificationChannel,
  data: { subject?: string; body: string; enabled: boolean },
): Promise<void> {
  const shopId = await getShopId(shopDomain);
  await prisma.notificationTemplate.upsert({
    where: { shopId_event_channel: { shopId, event, channel } },
    create: { shopId, event, channel, subject: data.subject, body: data.body, enabled: data.enabled },
    update: { subject: data.subject, body: data.body, enabled: data.enabled },
  });
}
