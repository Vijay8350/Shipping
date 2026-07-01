import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

import prisma from "../db.server";
import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { getShopPlan } from "../services/billing.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const [row, plan] = await Promise.all([
    prisma.shop.findUnique({
      where: { shop },
      select: { installState: true, installedAt: true, scope: true },
    }),
    getShopPlan(shop),
  ]);
  const shopId = (await prisma.shop.findUnique({ where: { shop }, select: { id: true } }))?.id ?? "";
  const [couriers, pickups, orders] = await Promise.all([
    prisma.courierAccount.count({ where: { shopId, enabled: true } }),
    prisma.pickupAddress.count({ where: { shopId } }),
    prisma.order.count({ where: { shopId } }),
  ]);

  return json({
    shop,
    plan: plan.name,
    installState: row?.installState ?? "unknown",
    installedAt: row?.installedAt ? new Date(row.installedAt).toLocaleDateString("en-IN") : "—",
    scope: row?.scope ?? "",
    counts: { couriers, pickups, orders },
  });
}

const LINKS = [
  { to: "/logistics", title: "Logistics Config", desc: "Connect couriers & pickup addresses" },
  { to: "/notifications", title: "Notifications", desc: "Email & SMS templates" },
  { to: "/customer-experience", title: "Customer Experience", desc: "Tracking page, EDD, returns branding" },
  { to: "/billing", title: "Billing & Plans", desc: "Subscription and usage" },
  { to: "/automation", title: "Automation Rules", desc: "Auto-assign courier & auto-ship" },
];

export default function SettingsPage() {
  const { shop, plan, installState, installedAt, scope, counts } = useLoaderData<typeof loader>();

  return (
    <AppShell shop={shop}>
      <Page title="Settings" subtitle="Account, configuration and general preferences">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Account</Text>
                <InlineStack gap="400" wrap>
                  <BlockStack gap="050">
                    <Text as="span" tone="subdued" variant="bodySm">Store</Text>
                    <Text as="span" fontWeight="semibold">{shop}</Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="span" tone="subdued" variant="bodySm">Plan</Text>
                    <Text as="span" fontWeight="semibold">{plan}</Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="span" tone="subdued" variant="bodySm">Status</Text>
                    <Badge tone={installState === "installed" ? "success" : "critical"}>{installState}</Badge>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="span" tone="subdued" variant="bodySm">Installed</Text>
                    <Text as="span" fontWeight="semibold">{installedAt}</Text>
                  </BlockStack>
                </InlineStack>
                <InlineStack gap="200">
                  <Link to="/logout"><Button tone="critical" variant="secondary">Log out</Button></Link>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
              <Card><BlockStack gap="050"><Text as="span" variant="heading2xl" numeric>{counts.orders}</Text><Text as="span" tone="subdued" variant="bodySm">Orders synced</Text></BlockStack></Card>
              <Card><BlockStack gap="050"><Text as="span" variant="heading2xl" numeric>{counts.couriers}</Text><Text as="span" tone="subdued" variant="bodySm">Couriers connected</Text></BlockStack></Card>
              <Card><BlockStack gap="050"><Text as="span" variant="heading2xl" numeric>{counts.pickups}</Text><Text as="span" tone="subdued" variant="bodySm">Pickup addresses</Text></BlockStack></Card>
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Configuration</Text>
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                {LINKS.map((l) => (
                  <Link key={l.to} to={l.to} style={{ textDecoration: "none" }}>
                    <Card>
                      <BlockStack gap="100">
                        <Text as="span" fontWeight="semibold">{l.title}</Text>
                        <Text as="span" tone="subdued" variant="bodySm">{l.desc}</Text>
                      </BlockStack>
                    </Card>
                  </Link>
                ))}
              </InlineGrid>
            </BlockStack>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Granted scopes</Text>
                <Text as="span" tone="subdued" variant="bodySm">{scope || "—"}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
