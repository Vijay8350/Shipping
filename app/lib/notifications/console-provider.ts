import type { NotificationProvider, SendInput, SendResult } from "./types";

/**
 * No-op console stub (CLAUDE.md §9.6). Logs instead of sending. Swapped for MSG91 (SMS)
 * + SES (email) later with zero call-site changes. NEVER log full PII in production —
 * this stub redacts the recipient for safety.
 */
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly name = "console-stub";

  async send(input: SendInput): Promise<SendResult> {
    const redacted = redactRecipient(input.to);
    console.log(
      `[notify:${input.channel}] -> ${redacted} :: ${input.subject ? input.subject + " — " : ""}${input.body.slice(0, 120)}`,
    );
    // Deterministic-ish id without Date.now (kept stable for tests via crypto).
    const id = `stub_${Math.abs(hashCode(input.to + input.body)).toString(36)}`;
    return { providerMsgId: id };
  }
}

function redactRecipient(to: string): string {
  if (to.includes("@")) {
    const [user, domain] = to.split("@");
    return `${user.slice(0, 2)}***@${domain}`;
  }
  return to.length > 4 ? `***${to.slice(-4)}` : "***";
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
