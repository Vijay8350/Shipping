import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { useCallback } from "react";
import {
  Badge,
  BlockStack,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import { Prisma, ShipmentStatus } from "@prisma/client";

import prisma from "../db.server";
import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";

const STATUS_VALUES = Object.values(ShipmentStatus);

function statusTone(s: ShipmentStatus): "success" | "attention" | "warning" | "critical" | "info" | undefined {
  switch (s) {
    case "DELIVERED":
    case "RTO_DELIVERED":
    case "RETURN_RECEIVED":
      return "success";
    case "OUT_FOR_DELIVERY":
    case "IN_TRANSIT":
    case "SHIPPED":
      return "info";
    case "NDR":
      return "warning";
    case "RTO_INITIATED":
    case "CANCELLED":
      return "critical";
    default:
      return "attention";
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const courier = url.searchParams.get("courier") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  const where: Prisma.ShipmentWhereInput = { shop: { shop } };
  if (status && STATUS_VALUES.includes(status as ShipmentStatus)) {
    where.status = status as ShipmentStatus;
  }
  if (courier) where.courierKey = courier;
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
    if (to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(`${to}T23:59:59`);
  }

  const [shipments, couriers] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        order: { select: { id: true, name: true } },
        trackingEvents: { orderBy: { occurredAt: "desc" }, take: 25 },
      },
    }),
    prisma.shipment.findMany({
      where: { shop: { shop } },
      distinct: ["courierKey"],
      select: { courierKey: true },
    }),
  ]);

  return json({
    shop,
    status,
    courier,
    from,
    to,
    courierOptions: couriers.map((c) => c.courierKey),
    shipments: shipments.map((s) => ({
      id: s.id,
      awb: s.awb,
      courierKey: s.courierKey,
      status: s.status,
      rawStatus: s.rawStatus,
      orderId: s.order.id,
      orderName: s.order.name,
      lastTrackedAt: s.lastTrackedAt ? s.lastTrackedAt.toISOString().slice(0, 16).replace("T", " ") : null,
      events: s.trackingEvents.map((e) => ({
        id: e.id,
        status: e.status,
        rawStatus: e.rawStatus,
        location: e.location,
        message: e.message,
        occurredAt: e.occurredAt.toISOString().slice(0, 16).replace("T", " "),
      })),
    })),
  });
}

export default function TrackingPage() {
  const { shop, shipments, status, courier, from, to, courierOptions } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams);
      if (value) params.set(key, value);
      else params.delete(key);
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  return (
    <AppShell shop={shop}>
      <Page title="Order tracking" subtitle="Live shipment status and event timeline">
        <Layout>
          <Layout.Section>
            <Card>
              <InlineStack gap="300" wrap>
                <Select
                  label="Status"
                  options={[
                    { label: "All", value: "" },
                    ...STATUS_VALUES.map((s) => ({ label: s, value: s })),
                  ]}
                  value={status}
                  onChange={(v) => update("status", v)}
                />
                <Select
                  label="Courier"
                  options={[
                    { label: "All", value: "" },
                    ...courierOptions.map((c) => ({ label: c, value: c })),
                  ]}
                  value={courier}
                  onChange={(v) => update("courier", v)}
                />
                <div>
                  <Text as="span" variant="bodySm">From</Text>
                  <input type="date" value={from} onChange={(e) => update("from", e.target.value)} />
                </div>
                <div>
                  <Text as="span" variant="bodySm">To</Text>
                  <input type="date" value={to} onChange={(e) => update("to", e.target.value)} />
                </div>
              </InlineStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            {shipments.length === 0 ? (
              <Card>
                <EmptyState
                  heading="No shipments to track"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Ship an order to start tracking it here.</p>
                </EmptyState>
              </Card>
            ) : (
              <BlockStack gap="300">
                {shipments.map((s) => (
                  <Card key={s.id}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Link to={`/orders/${s.orderId}`}>
                            <Text as="span" fontWeight="semibold">
                              {s.orderName}
                            </Text>
                          </Link>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {s.courierKey} · {s.awb}
                          </Text>
                        </InlineStack>
                        <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                      </InlineStack>

                      {s.events.length === 0 ? (
                        <Text as="p" tone="subdued" variant="bodySm">
                          No tracking events yet{s.lastTrackedAt ? ` (last polled ${s.lastTrackedAt})` : ""}.
                        </Text>
                      ) : (
                        <BlockStack gap="100">
                          {s.events.map((e) => (
                            <InlineStack key={e.id} gap="200" align="start">
                              <Text as="span" variant="bodySm" tone="subdued">
                                {e.occurredAt}
                              </Text>
                              <Badge size="small" tone={statusTone(e.status)}>
                                {e.status}
                              </Badge>
                              <Text as="span" variant="bodySm">
                                {[e.message || e.rawStatus, e.location].filter(Boolean).join(" · ")}
                              </Text>
                            </InlineStack>
                          ))}
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            )}
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
