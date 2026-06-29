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
import { ShipmentStatus } from "@prisma/client";

import prisma from "../db.server";
import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const shopRow = await prisma.shop.findUnique({ where: { shop }, select: { id: true } });
  const shopId = shopRow?.id ?? "__none__";

  const [orders, inTransit, ndr, rto, pendingReturns, delivered] = await prisma.$transaction([
    prisma.order.count({ where: { shopId } }),
    prisma.shipment.count({
      where: { shopId, status: { in: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.SHIPPED] } },
    }),
    prisma.shipment.count({ where: { shopId, status: ShipmentStatus.NDR } }),
    prisma.shipment.count({
      where: { shopId, status: { in: [ShipmentStatus.RTO_INITIATED, ShipmentStatus.RTO_DELIVERED] } },
    }),
    prisma.return.count({ where: { shopId, status: "PENDING" } }),
    prisma.shipment.count({ where: { shopId, status: ShipmentStatus.DELIVERED } }),
  ]);

  return json({ shop, stats: { orders, inTransit, ndr, rto, pendingReturns, delivered } });
}

function Stat({ label, value, to, tone }: { label: string; value: number; to: string; tone?: "critical" | "caution" }) {
  return (
    <Link to={to} style={{ textDecoration: "none" }}>
      <Card>
        <BlockStack gap="100">
          <Text as="span" variant="heading2xl" tone={tone}>
            {value}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {label}
          </Text>
        </BlockStack>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { shop, stats } = useLoaderData<typeof loader>();

  return (
    <AppShell shop={shop}>
      <Page title="Dashboard" subtitle={shop}>
        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
              <Stat label="Orders" value={stats.orders} to="/orders" />
              <Stat label="In transit" value={stats.inTransit} to="/tracking" />
              <Stat label="Delivered" value={stats.delivered} to="/tracking" />
              <Stat label="NDR — needs action" value={stats.ndr} to="/ndr" tone={stats.ndr ? "caution" : undefined} />
              <Stat label="RTO" value={stats.rto} to="/rto" tone={stats.rto ? "critical" : undefined} />
              <Stat label="Pending returns" value={stats.pendingReturns} to="/returns" tone={stats.pendingReturns ? "caution" : undefined} />
            </InlineGrid>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
