import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { useCallback } from "react";
import {
  Badge,
  Card,
  EmptyState,
  IndexTable,
  Page,
  Pagination,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import type { Prisma } from "@prisma/client";

import prisma from "../db.server";
import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import {
  ORDER_TABS,
  financialStatusTone,
  formatMoney,
  fulfillmentStatusTone,
} from "../lib/order-status";

const PAGE_SIZE = 20;

export async function loader({ request }: LoaderFunctionArgs) {
  const shopDomain = await requireShop(request);
  const shopRow = await prisma.shop.findUnique({
    where: { shop: shopDomain },
    select: { id: true },
  });

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const where: Prisma.OrderWhereInput = { shopId: shopRow?.id ?? "__none__" };
  if (tab === "unfulfilled") where.fulfillmentStatus = { in: ["unfulfilled", null] as never };
  else if (tab === "fulfilled") where.fulfillmentStatus = "fulfilled";
  else if (tab === "partial")
    where.fulfillmentStatus = { in: ["partial", "partially_fulfilled"] };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
    ];
  }

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { shopifyCreatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where }),
  ]);

  return json({
    shop: shopDomain,
    tab,
    q,
    page,
    total,
    pageSize: PAGE_SIZE,
    orders: orders.map((o) => ({
      id: o.id,
      name: o.name,
      customerName: o.customerName,
      email: o.email,
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      totalPrice: o.totalPrice,
      currency: o.currency,
      lineItemsCount: o.lineItemsCount,
      destination: [o.shippingCity, o.shippingProvince].filter(Boolean).join(", "),
      createdAt: o.shopifyCreatedAt
        ? o.shopifyCreatedAt.toISOString().slice(0, 10)
        : "",
    })),
  });
}

export default function OrdersPage() {
  const { shop, orders, tab, q, page, total, pageSize } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = Math.max(
    0,
    ORDER_TABS.findIndex((t) => t.id === tab),
  );

  const updateParam = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      // Any filter change resets pagination.
      if (!("page" in next)) params.set("page", "1");
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const handleTab = useCallback(
    (index: number) => updateParam({ tab: ORDER_TABS[index].id }),
    [updateParam],
  );

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const rowMarkup = orders.map((order, index) => (
    <IndexTable.Row id={order.id} key={order.id} position={index}>
      <IndexTable.Cell>
        <Link to={`/orders/${order.id}`}>
          <Text as="span" fontWeight="semibold">
            {order.name}
          </Text>
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>{order.createdAt}</IndexTable.Cell>
      <IndexTable.Cell>
        {order.customerName || order.email || "—"}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {order.financialStatus ? (
          <Badge tone={financialStatusTone(order.financialStatus)}>
            {order.financialStatus}
          </Badge>
        ) : (
          "—"
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={fulfillmentStatusTone(order.fulfillmentStatus)}>
          {order.fulfillmentStatus || "unfulfilled"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>{order.lineItemsCount}</IndexTable.Cell>
      <IndexTable.Cell>{order.destination || "—"}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {formatMoney(order.totalPrice, order.currency)}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppShell shop={shop}>
      <Page
        title="Orders"
        subtitle={`${total} order${total === 1 ? "" : "s"} synced from Shopify`}
      >
        <Card padding="0">
          <Tabs tabs={ORDER_TABS.map((t) => ({ id: t.id, content: t.label }))} selected={selectedTab} onSelect={handleTab} />
          <div style={{ padding: "12px" }}>
            <TextField
              label="Search orders"
              labelHidden
              placeholder="Search by order #, customer, or email"
              value={q}
              onChange={(value) => updateParam({ q: value })}
              clearButton
              onClearButtonClick={() => updateParam({ q: null })}
              autoComplete="off"
            />
          </div>
          {orders.length === 0 ? (
            <EmptyState
              heading="No orders yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                Orders sync automatically from Shopify. New orders appear here within
                seconds of being created.
              </p>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "order", plural: "orders" }}
              itemCount={orders.length}
              selectable={false}
              headings={[
                { title: "Order" },
                { title: "Date" },
                { title: "Customer" },
                { title: "Payment" },
                { title: "Fulfillment" },
                { title: "Items" },
                { title: "Destination" },
                { title: "Total", alignment: "end" },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "12px",
              borderTop: "1px solid var(--p-color-border)",
            }}
          >
            <Pagination
              label={`Page ${page} of ${lastPage}`}
              hasPrevious={page > 1}
              onPrevious={() => updateParam({ page: String(page - 1) })}
              hasNext={page < lastPage}
              onNext={() => updateParam({ page: String(page + 1) })}
            />
          </div>
        </Card>
      </Page>
    </AppShell>
  );
}
