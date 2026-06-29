import prisma from "../../app/db.server";
import { meterShopUsage } from "../../app/services/usage.server";

/**
 * Usage metering cron (CLAUDE.md §5, §9.2). Meters every shop with an active subscription,
 * emitting Shopify overage charges. Idempotent: already-billed UsageRecords are skipped.
 */
export async function processMeterUsage(): Promise<void> {
  const subs = await prisma.subscription.findMany({
    where: { status: "active" },
    select: { shop: { select: { shop: true } } },
    distinct: ["shopId"],
  });

  for (const s of subs) {
    try {
      const res = await meterShopUsage(s.shop.shop);
      if (res.charged || res.included) {
        console.log(
          `[worker] metered ${s.shop.shop}: ${res.included} included, ${res.charged} charged${res.capReached ? " (cap reached)" : ""}`,
        );
      }
    } catch (err) {
      console.error(`[worker] metering failed for ${s.shop.shop}:`, (err as Error).message);
    }
  }
}
