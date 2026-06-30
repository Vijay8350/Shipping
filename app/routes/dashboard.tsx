import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  BlockStack,
  Card,
  InlineGrid,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { getAnalytics, type Bucket } from "../services/analytics.server";
import { getShopPlan } from "../services/billing.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const [analytics, plan] = await Promise.all([getAnalytics(shop), getShopPlan(shop)]);
  return json({ shop, analytics, premium: plan.features.premiumAnalytics, planName: plan.name });
}

function Stat({ label, value, to, tone }: { label: string; value: number; to: string; tone?: "critical" | "caution" }) {
  return (
    <Link to={to} style={{ textDecoration: "none" }}>
      <Card>
        <BlockStack gap="100">
          <Text as="span" variant="heading2xl" tone={tone} numeric>{value}</Text>
          <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
        </BlockStack>
      </Card>
    </Link>
  );
}

function BarList({ title, data, locked }: { title: string; data: Bucket[]; locked?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">{title}</Text>
        {locked ? (
          <BlockStack gap="100">
            <Text as="p" tone="subdued" variant="bodySm">🔒 Premium analytics</Text>
            <Link to="/billing">Upgrade to unlock</Link>
          </BlockStack>
        ) : data.length === 0 ? (
          <Text as="p" tone="subdued" variant="bodySm">No data yet</Text>
        ) : (
          <BlockStack gap="200">
            {data.map((d) => (
              <div key={d.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>{d.label}</span>
                  <span>{d.value}</span>
                </div>
                <div style={{ background: "#f1f1f1", borderRadius: 4, height: 8 }}>
                  <div style={{ width: `${(d.value / max) * 100}%`, background: "var(--p-color-bg-fill-brand, #1a73e8)", height: 8, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

export default function Dashboard() {
  const { shop, analytics, premium, planName } = useLoaderData<typeof loader>();
  const k = analytics.kpis;

  return (
    <AppShell shop={shop}>
      <Page title="Dashboard" subtitle={`${shop} · ${planName} plan`}>
        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="400">
              <Stat label="Orders" value={k.orders} to="/orders" />
              <Stat label="In transit" value={k.inTransit} to="/tracking" />
              <Stat label="Delivered" value={k.delivered} to="/tracking" />
              <Stat label={`Delivered rate ${k.deliveredRatePct}%`} value={k.deliveredRatePct} to="/tracking" />
              <Stat label="NDR" value={k.ndr} to="/ndr" tone={k.ndr ? "caution" : undefined} />
              <Stat label="RTO" value={k.rto} to="/rto" tone={k.rto ? "critical" : undefined} />
              <Stat label="Pending returns" value={k.pendingReturns} to="/returns" tone={k.pendingReturns ? "caution" : undefined} />
              <Stat label="Shipments" value={k.shipments} to="/tracking" />
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <BarList title="Shipment status" data={analytics.statusBreakdown} />
              <BarList title="COD vs Prepaid" data={analytics.codVsPrepaid} />
              <BarList title="Payment status" data={analytics.paymentBreakdown} />
              <BarList title="Returns" data={analytics.returnsBreakdown} />
              {/* Premium widgets — gated by plan (§10 plan gating). */}
              <BarList title="Orders (last 14 days)" data={analytics.ordersByDay} locked={!premium} />
              <BarList title="Courier-wise shipments" data={analytics.courierBreakdown} locked={!premium} />
            </InlineGrid>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
