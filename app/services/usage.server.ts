import prisma from "../db.server";
import { decrypt } from "../lib/crypto.server";
import { adminGraphql } from "../lib/shopify/admin-graphql.server";
import { getPlan, splitIncludedOverage } from "../lib/plans";
import { getActiveSubscription } from "./billing.server";

/**
 * Usage metering (CLAUDE.md §9.2). Every billable shipment writes a UsageRecord from day
 * one (recordShipmentUsage). Phase 6 adds Shopify emission: the meter consumes the plan's
 * included shipments first, then emits appUsageRecordCreate for overage — marking each
 * record billed so a shipment is NEVER double-billed (§9.1).
 */
export async function recordShipmentUsage(
  shopId: string,
  shipmentId: string,
): Promise<void> {
  const existing = await prisma.usageRecord.findFirst({ where: { shipmentId } });
  if (existing) return;
  await prisma.usageRecord.create({
    data: { shopId, shipmentId, billed: false, currency: "USD" },
  });
}

const USAGE_RECORD_CREATE = /* GraphQL */ `
  mutation Usage($id: ID!, $price: MoneyInput!, $description: String!) {
    appUsageRecordCreate(subscriptionLineItemId: $id, price: $price, description: $description) {
      appUsageRecord { id }
      userErrors { field message }
    }
  }
`;

interface UsageRecordCreateResult {
  appUsageRecordCreate?: {
    appUsageRecord?: { id: string } | null;
    userErrors?: Array<{ message: string }>;
  };
}

/**
 * Emit Shopify usage charges for a shop's unbilled shipments this period. Included
 * shipments are consumed first (marked billed, no charge); overage is charged at the
 * plan rate up to the Shopify cap. Returns counts. Safe to run repeatedly.
 */
export async function meterShopUsage(shopDomain: string): Promise<{
  included: number;
  charged: number;
  capReached: boolean;
}> {
  const subscription = await getActiveSubscription(shopDomain);
  if (!subscription) return { included: 0, charged: 0, capReached: false };

  const plan = getPlan(subscription.plan);
  const periodStart = subscription.currentPeriodStart ?? new Date(0);

  const shop = await prisma.shop.findUniqueOrThrow({
    where: { shop: shopDomain },
    select: { id: true, accessToken: true },
  });

  const periodFilter = { shopId: shop.id, createdAt: { gte: periodStart } };
  const priorBilled = await prisma.usageRecord.count({
    where: { ...periodFilter, billed: true },
  });
  const unbilled = await prisma.usageRecord.findMany({
    where: { ...periodFilter, billed: false },
    orderBy: { createdAt: "asc" },
  });
  if (unbilled.length === 0) return { included: 0, charged: 0, capReached: false };

  const { includedCount } = splitIncludedOverage(priorBilled, plan.included, unbilled.length);

  // Included shipments: mark billed, no charge.
  const includedIds = unbilled.slice(0, includedCount).map((u) => u.id);
  if (includedIds.length) {
    await prisma.usageRecord.updateMany({
      where: { id: { in: includedIds } },
      data: { billed: true, amount: 0 },
    });
  }

  const overage = unbilled.slice(includedCount);
  if (overage.length === 0 || !subscription.usageLineItemId || !shop.accessToken) {
    return { included: includedCount, charged: 0, capReached: false };
  }

  const token = decrypt(shop.accessToken);
  let charged = 0;
  let capReached = false;

  for (const record of overage) {
    const data = await adminGraphql<UsageRecordCreateResult>(shopDomain, token, USAGE_RECORD_CREATE, {
      id: subscription.usageLineItemId,
      price: { amount: (plan.overageCents / 100).toFixed(2), currencyCode: "USD" },
      description: `Shipment overage (${record.id})`,
    });
    const errs = data.appUsageRecordCreate?.userErrors ?? [];
    if (errs.length) {
      // Most commonly the capped amount was exceeded — stop, leave the rest unbilled.
      capReached = true;
      break;
    }
    const usageId = data.appUsageRecordCreate?.appUsageRecord?.id;
    await prisma.usageRecord.update({
      where: { id: record.id },
      data: { billed: true, amount: plan.overageCents, shopifyUsageRecordId: usageId ?? null },
    });
    charged += 1;
  }

  return { included: includedCount, charged, capReached };
}
