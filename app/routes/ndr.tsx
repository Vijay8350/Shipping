import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import {
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Page,
  Button,
} from "@shopify/polaris";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { listNdrShipments, recordNdrAction, type NdrAction } from "../services/worklists.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const ndr = await listNdrShipments(shop);
  return json({
    shop,
    rows: ndr.map((s) => ({
      id: s.id,
      awb: s.awb,
      courierKey: s.courierKey,
      rawStatus: s.rawStatus,
      orderId: s.order.id,
      orderName: s.order.name,
      customer: s.order.customerName,
      city: s.order.shippingCity,
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const shop = await requireShop(request);
  const form = await request.formData();
  await recordNdrAction(shop, String(form.get("shipmentId")), String(form.get("action")) as NdrAction);
  return redirect("/ndr");
}

export default function NdrPage() {
  const { shop, rows } = useLoaderData<typeof loader>();

  const markup = rows.map((r, i) => (
    <IndexTable.Row id={r.id} key={r.id} position={i}>
      <IndexTable.Cell>
        <Link to={`/orders/${r.orderId}`}>{r.orderName}</Link>
      </IndexTable.Cell>
      <IndexTable.Cell>{r.courierKey}</IndexTable.Cell>
      <IndexTable.Cell>{r.awb}</IndexTable.Cell>
      <IndexTable.Cell>{r.customer || "—"}</IndexTable.Cell>
      <IndexTable.Cell>{r.city || "—"}</IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Form method="post">
            <input type="hidden" name="shipmentId" value={r.id} />
            <input type="hidden" name="action" value="reattempt" />
            <Button submit variant="tertiary">Re-attempt</Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="shipmentId" value={r.id} />
            <input type="hidden" name="action" value="rto" />
            <Button submit variant="tertiary" tone="critical">Move to RTO</Button>
          </Form>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppShell shop={shop}>
      <Page title="NDR worklist" subtitle="Shipments with a failed delivery attempt">
        <Card padding="0">
          {rows.length === 0 ? (
            <EmptyState heading="No NDRs" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
              <p>Failed-delivery shipments will appear here for action.</p>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "NDR", plural: "NDRs" }}
              itemCount={rows.length}
              selectable={false}
              headings={[
                { title: "Order" },
                { title: "Courier" },
                { title: "AWB" },
                { title: "Customer" },
                { title: "City" },
                { title: "Action" },
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
