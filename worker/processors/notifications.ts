import type { Job } from "bullmq";

import type { NotificationJob } from "../../app/lib/queue-names";
import type { NotificationEvent } from "../../app/lib/notifications/types";
import { dispatchNotification } from "../../app/services/notifications.server";

/** Notification dispatcher (CLAUDE.md §5, §9.6). Sends via the provider + logs. */
export async function processNotification(job: Job<NotificationJob>): Promise<void> {
  await dispatchNotification({
    shopId: job.data.shopId,
    event: job.data.event as NotificationEvent,
    recipientEmail: job.data.recipientEmail,
    recipientPhone: job.data.recipientPhone,
    variables: job.data.variables,
  });
}
