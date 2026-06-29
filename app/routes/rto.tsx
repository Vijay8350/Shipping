import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { Badge, Card, EmptyState, IndexTable, Page } from "@shopify/polaris";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { listRtoShipments } from "../services/worklists.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const rto = await listRtoShipments(shop);
  return json({
    shop,
    rows: rto.map((s) => ({
      id: s.id,
      awb: s.awb,
      courierKey: s.courierKey,
      status: s.status,
      orderId: s.order.id,
      orderName: s.order.name,
      customer: s.order.customerName,
      city: s.order.shippingCity,
    })),
  });
}

export default function RtoPage() {
  const { shop, rows } = useLoaderData<typeof loader>();

  const markup = rows.map((r, i) => (
    <IndexTable.Row id={r.id} key={r.id} position={i}>
      <IndexTable.Cell>
        <Link to={`/orders/${r.orderId}`}>{r.orderName}</Link>
      </IndexTable.Cell>
      <IndexTable.Cell>{r.courierKey}</IndexTable.Cell>
      <IndexTable.Cell>{r.awb}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={r.status === "RTO_DELIVERED" ? "success" : "critical"}>{r.status}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>{r.customer || "—"}</IndexTable.Cell>
      <IndexTable.Cell>{r.city || "—"}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppShell shop={shop}>
      <Page title="RTO worklist" subtitle="Shipments returning to origin">
        <Card padding="0">
          {rows.length === 0 ? (
            <EmptyState heading="No RTOs" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
              <p>Return-to-origin shipments appear here.</p>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "RTO", plural: "RTOs" }}
              itemCount={rows.length}
              selectable={false}
              headings={[
                { title: "Order" },
                { title: "Courier" },
                { title: "AWB" },
                { title: "Status" },
                { title: "Customer" },
                { title: "City" },
              ]}
            >
              {markup}
            </IndexTable>
          )}
        </Card>
      </Page>
    </AppShell>
  );
}
