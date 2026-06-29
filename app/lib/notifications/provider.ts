import { ConsoleNotificationProvider } from "./console-provider";
import type { NotificationProvider } from "./types";

/**
 * Single place that picks the active provider (CLAUDE.md §9.6). Phase 4 = console stub.
 * Later: return new Msg91Provider() / SesProvider() based on channel/env — no call site
 * outside this module changes.
 */
let provider: NotificationProvider | null = null;

export function getNotificationProvider(): NotificationProvider {
  provider ??= new ConsoleNotificationProvider();
  return provider;
}
