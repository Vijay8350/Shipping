import prisma from "../db.server";
import { decrypt } from "../lib/crypto.server";
import { adminGraphql } from "../lib/shopify/admin-graphql.server";
import { getPlan, type Plan } from "../lib/plans";

/**
 * Shopify Billing (CLAUDE.md §10). Recurring USD plan + a usage line item for per-shipment
 * overage (§9.2). Uses the GraphQL Admin API with the merchant's offline token.
 * `test: true` is forced unless BILLING_LIVE=true so review/dev never makes real charges.
 *
 * GraphQL shapes follow Shopify's documented Billing API; validate before launch (§14).
 */

const usd = (cents: number) => ({ amount: (cents / 100).toFixed(2), currencyCode: "USD" });
const isTest = () => process.env.BILLING_LIVE !== "true";

async function shopToken(shopDomain: string): Promise<string> {
  const shop = await prisma.shop.findUnique({
    where: { shop: shopDomain },
    select: { accessToken: true },
  });
  if (!shop?.accessToken) throw new Error(`No offline token for ${shopDomain}`);
  return decrypt(shop.accessToken);
}

const CREATE_SUBSCRIPTION = /* GraphQL */ `
  mutation Create($name: String!, $returnUrl: URL!, $test: Boolean!, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: $lineItems) {
      confirmationUrl
      appSubscription { id status lineItems { id plan { pricingDetails { __typename } } } }
      userErrors { field message }
    }
  }
`;

interface CreateResult {
  appSubscriptionCreate?: {
    confirmationUrl?: string;
    appSubscription?: {
      id: string;
      status: string;
      lineItems?: Array<{ id: string; plan?: { pricingDetails?: { __typename?: string } } }>;
    } | null;
    userErrors?: Array<{ field?: string[]; message: string }>;
  };
}

/** Start a subscription; returns the confirmationUrl the merchant must approve. */
export async function createSubscription(
  shopDomain: string,
  planKey: string,
  appUrl: string,
): Promise<string> {
  const plan = getPlan(planKey);
  const token = await shopToken(shopDomain);

  const lineItems: unknown[] = [
    {
      plan: {
        appRecurringPricingDetails: {
          price: usd(plan.priceCents),
          interval: "EVERY_30_DAYS",
        },
      },
    },
  ];
  // Usage line item for per-shipment overage (skip for plans with no overage price).
  if (plan.overageCents > 0) {
    lineItems.push({
      plan: {
        appUsagePricingDetails: {
          terms: `Per shipment beyond ${plan.included} included shipments`,
          cappedAmount: usd(plan.cappedAmountCents),
        },
      },
    });
  }

  const returnUrl = `${appUrl.replace(/\/$/, "")}/billing/callback?plan=${plan.key}&shop=${encodeURIComponent(shopDomain)}`;
  const data = await adminGraphql<CreateResult>(shopDomain, token, CREATE_SUBSCRIPTION, {
    name: `Shipping Management — ${plan.name}`,
    returnUrl,
    test: isTest(),
    lineItems,
  });

  const errors = data.appSubscriptionCreate?.userErrors ?? [];
  if (errors.length) throw new Error(`Billing error: ${errors.map((e) => e.message).join("; ")}`);

  const sub = data.appSubscriptionCreate?.appSubscription;
  const confirmationUrl = data.appSubscriptionCreate?.confirmationUrl;
  if (!sub || !confirmationUrl) throw new Error("Billing did not return a confirmation URL.");

  const usageLineItemId = sub.lineItems?.find(
    (li) => li.plan?.pricingDetails?.__typename === "AppUsagePricing",
  )?.id;

  // Record as pending; the callback flips it active once the merchant approves.
  const shopId = (await prisma.shop.findUniqueOrThrow({ where: { shop: shopDomain }, select: { id: true } })).id;
  await prisma.subscription.upsert({
    where: { shopifyAppSubscriptionId: sub.id },
    create: {
      shopId,
      plan: plan.key,
      shopifyAppSubscriptionId: sub.id,
      usageLineItemId,
      status: "pending",
    },
    update: { plan: plan.key, usageLineItemId, status: "pending" },
  });

  return confirmationUrl;
}

/** Mark the plan active (called from the billing callback after merchant approval). */
export async function activatePlan(shopDomain: string, planKey: string): Promise<void> {
  const plan = getPlan(planKey);
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.shop.update({ where: { shop: shopDomain }, data: { plan: plan.key } }),
    prisma.subscription.updateMany({
      where: { shop: { shop: shopDomain }, plan: plan.key },
      data: { status: "active", currentPeriodStart: now, currentPeriodEnd: periodEnd },
    }),
  ]);
}

export async function getShopPlan(shopDomain: string): Promise<Plan> {
  const shop = await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { plan: true } });
  return getPlan(shop?.plan);
}

export async function getActiveSubscription(shopDomain: string) {
  return prisma.subscription.findFirst({
    where: { shop: { shop: shopDomain }, status: "active" },
    orderBy: { createdAt: "desc" },
  });
}
