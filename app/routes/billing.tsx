import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Banner,
  Button,
  Card,
  InlineGrid,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { PLANS } from "../lib/plans";
import { createSubscription, getShopPlan } from "../services/billing.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const current = await getShopPlan(shop);
  return json({ shop, currentPlan: current.key, plans: PLANS });
}

export async function action({ request }: ActionFunctionArgs) {
  const shop = await requireShop(request);
  const form = await request.formData();
  const planKey = String(form.get("planKey"));
  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;

  if (planKey === "free") {
    // Free plan: no Shopify charge — activate directly.
    const { activatePlan } = await import("../services/billing.server");
    await activatePlan(shop, "free");
    return redirect("/billing");
  }

  try {
    const confirmationUrl = await createSubscription(shop, planKey, appUrl);
    return redirect(confirmationUrl);
  } catch (err) {
    return json({ error: (err as Error).message });
  }
}

const money = (cents: number) => (cents === 0 ? "Free" : `$${(cents / 100).toFixed(0)}/mo`);

export default function BillingPage() {
  const { shop, currentPlan, plans } = useLoaderData<typeof loader>();

  return (
    <AppShell shop={shop}>
      <Page title="Plans & billing" subtitle="Subscription is billed in USD via Shopify">
        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              {plans.map((plan) => {
                const isCurrent = plan.key === currentPlan;
                return (
                  <Card key={plan.key}>
                    <BlockStack gap="300">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingMd">{plan.name}</Text>
                        <Text as="span" variant="heading2xl">{money(plan.priceCents)}</Text>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" tone="subdued">
                          {plan.included.toLocaleString()} shipments included
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          then ${(plan.overageCents / 100).toFixed(2)} / shipment
                        </Text>
                        <Text as="span" variant="bodySm" tone={plan.features.premiumAnalytics ? "success" : "subdued"}>
                          {plan.features.premiumAnalytics ? "✓" : "—"} Premium analytics
                        </Text>
                        <Text as="span" variant="bodySm" tone={plan.features.automationRules ? "success" : "subdued"}>
                          {plan.features.automationRules ? "✓" : "—"} Automation rules
                        </Text>
                      </BlockStack>
                      {isCurrent ? (
                        <Badge tone="success">Current plan</Badge>
                      ) : (
                        <Form method="post">
                          <input type="hidden" name="planKey" value={plan.key} />
                          <Button submit variant="primary" fullWidth>
                            {plan.priceCents === 0 ? "Switch to Free" : "Choose plan"}
                          </Button>
                        </Form>
                      )}
                    </BlockStack>
                  </Card>
                );
              })}
            </InlineGrid>
          </Layout.Section>
          <Layout.Section>
            <Banner tone="info">
              Charges run in <strong>test mode</strong> until <code>BILLING_LIVE=true</code>. Approving a
              paid plan redirects to Shopify, then back here.
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
