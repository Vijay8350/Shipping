import type { ActionFunctionArgs } from "@remix-run/node";
import { Prisma } from "@prisma/client";

import prisma from "../db.server";
import { enqueueWebhook } from "../lib/queues.server";
import { isComplianceTopic, payloadHash } from "../lib/webhooks.server";
import { markShopUninstalled } from "../services/orders.server";
import { authenticate } from "../shopify.server";

/**
 * Single HMAC-verified webhook endpoint (CLAUDE.md §9.4, §9.5, §10). All app + compliance
 * topics are delivered here. authenticate.webhook() verifies the HMAC and rejects
 * anything unsigned/invalid before we run any logic.
 *
 * Flow:
 *   1. Verify HMAC (library).
 *   2. Dedupe via WebhookLog(topic, payloadHash) — a duplicate delivery is a no-op (200).
 *   3. app/uninstalled + compliance topics handled inline (light).
 *   4. Everything else is ENQUEUED to the worker — never processed in the request (§5).
 */
export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request);

  const hash = payloadHash(topic, payload);
  const shopRow = await prisma.shop.findUnique({
    where: { shop },
    select: { id: true },
  });

  // Idempotency: the unique constraint on (topic, payloadHash) makes a repeated
  // delivery a no-op. If insert fails on P2002, we've already processed this one.
  try {
    await prisma.webhookLog.create({
      data: { topic, shopDomain: shop, shopId: shopRow?.id ?? null, payloadHash: hash },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return new Response(null, { status: 200 }); // already handled
    }
    throw err;
  }

  // app/uninstalled: clean up inline (CLAUDE.md Phase 1 — mark shop uninstalled).
  if (topic === "APP_UNINSTALLED") {
    await markShopUninstalled(shop);
    return new Response(null, { status: 200 });
  }

  // Compliance topics (§9.5): acknowledge. Full data export/erasure is finalized in the
  // App Store compliance pass (Phase 6); the verified receipt is logged above.
  if (isComplianceTopic(topic)) {
    return new Response(null, { status: 200 });
  }

  // Heavy work (order upserts, fulfillment sync) goes to the worker, not the request.
  await enqueueWebhook({ topic, shop, payload });
  return new Response(null, { status: 200 });
}
