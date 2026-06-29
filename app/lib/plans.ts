/**
 * Subscription plans (CLAUDE.md §10 — "Free → Gold + Enterprise"). Pure + unit-tested.
 * Prices are USD; money in integer minor units (cents). `included` = shipments included
 * per 30-day period; shipments beyond that bill at `overageCents` each (usage/overage,
 * §9.2) up to the Shopify usage cap.
 *
 * NOTE: exact prices/limits are placeholders pending the spec — adjust before launch (§14).
 */
export interface Plan {
  key: string;
  name: string;
  priceCents: number;
  included: number;
  overageCents: number;
  /** Usage cap presented to Shopify for the overage line item. */
  cappedAmountCents: number;
  features: PlanFeatures;
}

export interface PlanFeatures {
  premiumAnalytics: boolean;
  automationRules: boolean;
}

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    priceCents: 0,
    included: 50,
    overageCents: 30,
    cappedAmountCents: 5000,
    features: { premiumAnalytics: false, automationRules: false },
  },
  {
    key: "silver",
    name: "Silver",
    priceCents: 1900,
    included: 500,
    overageCents: 25,
    cappedAmountCents: 20000,
    features: { premiumAnalytics: true, automationRules: false },
  },
  {
    key: "gold",
    name: "Gold",
    priceCents: 4900,
    included: 2000,
    overageCents: 20,
    cappedAmountCents: 50000,
    features: { premiumAnalytics: true, automationRules: true },
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceCents: 19900,
    included: 10000,
    overageCents: 15,
    cappedAmountCents: 200000,
    features: { premiumAnalytics: true, automationRules: true },
  },
];

export const DEFAULT_PLAN_KEY = "free";

export function getPlan(key: string | null | undefined): Plan {
  return PLANS.find((p) => p.key === key) ?? PLANS[0];
}

export function planHasFeature(key: string | null | undefined, feature: keyof PlanFeatures): boolean {
  return getPlan(key).features[feature];
}

/**
 * Split a batch of new billable shipments into included vs overage, given how many were
 * already billed this period. Pure — the heart of "no double-billing" allocation (§9.2).
 */
export function splitIncludedOverage(
  priorBilledThisPeriod: number,
  included: number,
  newCount: number,
): { includedCount: number; overageCount: number } {
  const remainingIncluded = Math.max(0, included - priorBilledThisPeriod);
  const includedCount = Math.min(newCount, remainingIncluded);
  return { includedCount, overageCount: newCount - includedCount };
}
