import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { Form } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Banner,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";

import prisma from "../db.server";
import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { formatMoney } from "../lib/order-status";
import { listCourierAccounts } from "../services/courier-accounts.server";
import { getDefaultPickupAddress } from "../services/pickup-addresses.server";
import { shipOrder } from "../services/shipping.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const order = await prisma.order.findFirst({
    where: { id: params.id, shop: { shop } },
    include: { shipments: { orderBy: { createdAt: "desc" } } },
  });
  if (!order) throw new Response("Order not found", { status: 404 });

  const [accounts, pickup] = await Promise.all([
    listCourierAccounts(shop),
    getDefaultPickupAddress(shop),
  ]);
  const enabledCouriers = accounts.filter((a) => a.enabled);

  return json({
    shop,
    hasPickup: Boolean(pickup),
    enabledCouriers: enabledCouriers.map((a) => ({ key: a.courierKey, testMode: a.testMode })),
    order: {
      id: order.id,
      name: order.name,
      customerName: order.customerName,
      email: order.email,
      phone: order.phone,
      financialStatus: order.financialStatus,
      totalPrice: order.totalPrice,
      currency: order.currency,
      address: [
        order.shippingName,
        order.shippingAddress1,
        order.shippingAddress2,
        order.shippingCity && `${order.shippingCity}, ${order.shippingProvince ?? ""} ${order.shippingZip ?? ""}`,
      ]
        .filter(Boolean)
        .join("\n"),
      shipments: order.shipments.map((s) => ({
        id: s.id,
        courierKey: s.courierKey,
        awb: s.awb,
        status: s.status,
        rawStatus: s.rawStatus,
      })),
    },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const shop = await requireShop(request);
  const form = await request.formData();
  const courierKey = String(form.get("courierKey"));
  const weightGrams = Math.max(1, Number(form.get("weightGrams") || 500));
  const cod = form.get("cod") === "on";
  const codAmount = cod ? Number(form.get("codAmount") || 0) : undefined;

  try {
    const { idempotent } = await shipOrder(shop, {
      orderId: String(params.id),
      courierKey,
      weightGrams,
      cod,
      codAmount,
    });
    return json({ ok: true, idempotent, error: null });
  } catch (err) {
    return json({ ok: false, idempotent: false, error: (err as Error).message });
  }
}

export default function OrderDetail() {
  const { shop, order, enabledCouriers, hasPickup } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shipping = navigation.state === "submitting";

  const [courierKey, setCourierKey] = useState(enabledCouriers[0]?.key ?? "");
  const [weight, setWeight] = useState("500");
  const [cod, setCod] = useState(false);
  const [codAmount, setCodAmount] = useState("0");

  const hasShipment = order.shipments.length > 0;

  return (
    <AppShell shop={shop}>
      <Page
        title={`Order ${order.name}`}
        backAction={{ content: "Orders", url: "/orders" }}
      >
        <Layout>
          <Layout.Section>
            {actionData?.error ? (
              <div style={{ marginBottom: 16 }}>
                <Banner tone="critical" title="Could not ship">
                  {actionData.error}
                </Banner>
              </div>
            ) : null}
            {actionData?.ok ? (
              <div style={{ marginBottom: 16 }}>
                <Banner tone="success">
                  {actionData.idempotent
                    ? "This order was already shipped — showing the existing AWB."
                    : "Shipment created."}
                </Banner>
              </div>
            ) : null}

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Customer
                </Text>
                <Text as="p">{order.customerName || "—"}</Text>
                <Text as="p" tone="subdued">
                  {order.email || ""} {order.phone ? `· ${order.phone}` : ""}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <span style={{ whiteSpace: "pre-line" }}>{order.address || "No address"}</span>
                </Text>
                <Text as="p" fontWeight="semibold">
                  {formatMoney(order.totalPrice, order.currency)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Shipping
                </Text>

                {hasShipment ? (
                  <BlockStack gap="200">
                    {order.shipments.map((s) => (
                      <Card key={s.id} background="bg-surface-secondary">
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" fontWeight="semibold">
                              {s.courierKey}
                            </Text>
                            <Badge>{s.status}</Badge>
                          </InlineStack>
                          <Text as="span" variant="bodySm">
                            AWB: {s.awb}
                          </Text>
                          <Link to={`/labels/${s.id}`} reloadDocument>
                            Download label (PDF)
                          </Link>
                        </BlockStack>
                      </Card>
                    ))}
                  </BlockStack>
                ) : !hasPickup ? (
                  <Banner tone="warning">
                    Add a pickup address in <Link to="/logistics">Logistics configuration</Link>{" "}
                    before shipping.
                  </Banner>
                ) : enabledCouriers.length === 0 ? (
                  <Banner tone="warning">
                    Connect a courier in <Link to="/logistics">Logistics configuration</Link> first.
                  </Banner>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="courierKey" value={courierKey} />
                    <BlockStack gap="300">
                      <Select
                        label="Courier"
                        options={enabledCouriers.map((c) => ({
                          label: `${c.key}${c.testMode ? " (test)" : ""}`,
                          value: c.key,
                        }))}
                        value={courierKey}
                        onChange={setCourierKey}
                      />
                      <TextField
                        label="Weight (grams)"
                        type="number"
                        name="weightGrams"
                        value={weight}
                        onChange={setWeight}
                        autoComplete="off"
                      />
                      <Checkbox label="Cash on delivery" checked={cod} onChange={setCod} />
                      <input type="hidden" name="cod" value={cod ? "on" : ""} />
                      {cod ? (
                        <TextField
                          label="COD amount (minor units)"
                          type="number"
                          name="codAmount"
                          value={codAmount}
                          onChange={setCodAmount}
                          autoComplete="off"
                        />
                      ) : null}
                      <Button submit variant="primary" loading={shipping}>
                        Create shipment
                      </Button>
                    </BlockStack>
                  </Form>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
