import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Banner,
  Button,
  Card,
  EmptyState,
  IndexTable,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { listCourierAccounts } from "../services/courier-accounts.server";
import { listPickupRequests, schedulePickup } from "../services/pickups.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const [accounts, pickups] = await Promise.all([
    listCourierAccounts(shop),
    listPickupRequests(shop),
  ]);
  return json({
    shop,
    couriers: accounts.filter((a) => a.enabled).map((a) => a.courierKey),
    pickups: pickups.map((p) => ({
      id: p.id,
      courierKey: p.courierKey,
      status: p.status,
      externalPickupId: p.externalPickupId,
      scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString().slice(0, 10) : "",
      packageCount: p.packageCount,
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const shop = await requireShop(request);
  const form = await request.formData();
  try {
    await schedulePickup(shop, {
      courierKey: String(form.get("courierKey")),
      pickupDate: String(form.get("pickupDate")),
      packageCount: Number(form.get("packageCount") || 1),
    });
  } catch (err) {
    return json({ error: (err as Error).message });
  }
  return redirect("/pickups");
}

const statusTone = (s: string) =>
  s === "scheduled" ? "success" : s === "failed" ? "critical" : undefined;

export default function PickupsPage() {
  const { shop, couriers, pickups } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [courierKey, setCourierKey] = useState(couriers[0] ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [count, setCount] = useState("1");

  const rows = pickups.map((p, i) => (
    <IndexTable.Row id={p.id} key={p.id} position={i}>
      <IndexTable.Cell>{p.courierKey}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={statusTone(p.status)}>{p.status}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>{p.scheduledFor}</IndexTable.Cell>
      <IndexTable.Cell>{p.externalPickupId || "—"}</IndexTable.Cell>
      <IndexTable.Cell>{p.packageCount}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppShell shop={shop}>
      <Page title="Pickup requests" subtitle="Schedule courier pickups and track their status">
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Schedule a pickup
                </Text>
                {actionData?.error ? (
                  <Banner tone="critical">{actionData.error}</Banner>
                ) : null}
                {couriers.length === 0 ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Connect a courier in Logistics configuration first.
                  </Text>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="courierKey" value={courierKey} />
                    <BlockStack gap="300">
                      <Select
                        label="Courier"
                        options={couriers.map((c) => ({ label: c, value: c }))}
                        value={courierKey}
                        onChange={setCourierKey}
                      />
                      <TextField
                        label="Pickup date"
                        type="date"
                        name="pickupDate"
                        value={date}
                        onChange={setDate}
                        autoComplete="off"
                      />
                      <TextField
                        label="Package count"
                        type="number"
                        name="packageCount"
                        value={count}
                        onChange={setCount}
                        autoComplete="off"
                      />
                      <Button submit variant="primary">
                        Request pickup
                      </Button>
                    </BlockStack>
                  </Form>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card padding="0">
              {pickups.length === 0 ? (
                <EmptyState
                  heading="No pickup requests yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Scheduled pickups will appear here with their status.</p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: "pickup", plural: "pickups" }}
                  itemCount={pickups.length}
                  selectable={false}
                  headings={[
                    { title: "Courier" },
                    { title: "Status" },
                    { title: "Scheduled" },
                    { title: "Pickup ID" },
                    { title: "Packages" },
                  ]}
                >
                  {rows}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
