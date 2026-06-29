import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { requireShop } from "../session.server";
import { activatePlan } from "../services/billing.server";

/**
 * Shopify redirects here after the merchant approves a subscription (the returnUrl set in
 * createSubscription). We activate the plan and bounce to /billing. Shopify also sends an
 * app_subscriptions/update webhook for the source of truth on status changes.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const url = new URL(request.url);
  const planKey = url.searchParams.get("plan") ?? "free";
  await activatePlan(shop, planKey);
  return redirect("/billing");
}
