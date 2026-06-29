import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Banner,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import {
  acceptReturn,
  createReturn,
  declineReturn,
  listReturns,
  markReturnReceived,
} from "../services/returns.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const returns = await listReturns(shop);
  return json({
    shop,
    returns: returns.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      reverseAwb: r.reverseAwb,
      orderId: r.order.id,
      orderName: r.order.name,
      customer: r.order.customerName,
      createdAt: r.createdAt.toISOString().slice(0, 10),
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const shop = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("returnId") || "");

  try {
    if (intent === "create") {
      await createReturn(shop, {
        orderId: String(form.get("orderId")),
        reason: String(form.get("reason") || "") || undefined,
      });
    } else if (intent === "accept") {
      await acceptReturn(shop, id);
    } else if (intent === "decline") {
      await declineReturn(shop, id);
    } else if (intent === "received") {
      await markReturnReceived(shop, id);
    }
  } catch (err) {
    return json({ error: (err as Error).message });
  }
  return redirect("/returns");
}

const tone = (s: string) =>
  s === "RECEIVED" ? "success" : s === "DECLINED" || s === "CANCELLED" ? "critical" : s === "IN_TRANSIT" ? "info" : "attention";

export default function ReturnsPage() {
  const { shop, returns } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <AppShell shop={shop}>
      <Page title="Return requests" subtitle="Review returns and generate reverse pickups">
        {actionData?.error ? (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="critical">{actionData.error}</Banner>
          </div>
        ) : null}
        <Layout>
          <Layout.Section>
            {returns.length === 0 ? (
              <Card>
                <EmptyState heading="No return requests" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
                  <p>Returns submitted by customers (Phase 5) or created here will appear in this list.</p>
                </EmptyState>
              </Card>
            ) : (
              <BlockStack gap="300">
                {returns.map((r) => (
                  <Card key={r.id}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Link to={`/orders/${r.orderId}`}>
                            <Text as="span" fontWeight="semibold">{r.orderName}</Text>
                          </Link>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {r.customer || ""} · {r.createdAt}
                          </Text>
                        </InlineStack>
                        <Badge tone={tone(r.status)}>{r.status}</Badge>
                      </InlineStack>
                      {r.reason ? (
                        <Text as="p" variant="bodySm">Reason: {r.reason}</Text>
                      ) : null}
                      {r.reverseAwb ? (
                        <Text as="p" variant="bodySm">Reverse AWB: {r.reverseAwb}</Text>
                      ) : null}
                      <InlineStack gap="200">
                        {r.status === "PENDING" ? (
                          <>
                            <Form method="post">
                              <input type="hidden" name="intent" value="accept" />
                              <input type="hidden" name="returnId" value={r.id} />
                              <Button submit variant="primary">Accept & create reverse pickup</Button>
                            </Form>
                            <Form method="post">
                              <input type="hidden" name="intent" value="decline" />
                              <input type="hidden" name="returnId" value={r.id} />
                              <Button submit tone="critical" variant="tertiary">Decline</Button>
                            </Form>
                          </>
                        ) : null}
                        {r.status === "IN_TRANSIT" || r.status === "APPROVED" ? (
                          <Form method="post">
                            <input type="hidden" name="intent" value="received" />
                            <input type="hidden" name="returnId" value={r.id} />
                            <Button submit variant="primary">Mark received</Button>
                          </Form>
                        ) : null}
                      </InlineStack>
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            )}
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Create a return</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Enter an order ID to open a return manually. (Customer self-service comes in Phase 5.)
                </Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="create" />
                  <BlockStack gap="300">
                    <TextField name="orderId" label="Order ID" autoComplete="off" requiredIndicator />
                    <TextField name="reason" label="Reason" autoComplete="off" />
                    <Button submit>Create return</Button>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
