import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { SUPPORTED_COURIERS, getCourierMeta } from "../lib/carriers/registry";
import {
  listCourierAccounts,
  setCourierFlags,
  upsertCourierAccount,
} from "../services/courier-accounts.server";
import {
  createPickupAddress,
  listPickupAddresses,
} from "../services/pickup-addresses.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const [accounts, pickups] = await Promise.all([
    listCourierAccounts(shop),
    listPickupAddresses(shop),
  ]);
  return json({ shop, accounts, pickups, couriers: SUPPORTED_COURIERS });
}

export async function action({ request }: ActionFunctionArgs) {
  const shop = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  try {
    if (intent === "connect-courier") {
      const courierKey = String(form.get("courierKey"));
      const meta = getCourierMeta(courierKey);
      if (!meta) throw new Error("Unknown courier");
      const credentials: Record<string, unknown> = {};
      for (const field of meta.credentialFields) {
        const value = form.get(field.name);
        if (field.required && !value) {
          return json({ error: `${field.label} is required` }, { status: 400 });
        }
        if (value) credentials[field.name] = String(value);
      }
      await upsertCourierAccount(shop, courierKey, credentials, { testMode: true });
    } else if (intent === "toggle-enabled") {
      await setCourierFlags(shop, String(form.get("courierKey")), {
        enabled: form.get("enabled") === "true",
      });
    } else if (intent === "toggle-testmode") {
      await setCourierFlags(shop, String(form.get("courierKey")), {
        testMode: form.get("testMode") === "true",
      });
    } else if (intent === "add-pickup") {
      await createPickupAddress(shop, {
        label: String(form.get("label") || "Warehouse"),
        contactName: String(form.get("contactName") || ""),
        phone: String(form.get("phone") || ""),
        line1: String(form.get("line1") || ""),
        line2: String(form.get("line2") || "") || undefined,
        city: String(form.get("city") || ""),
        state: String(form.get("state") || ""),
        pincode: String(form.get("pincode") || ""),
        isDefault: form.get("isDefault") === "on",
      });
    }
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 400 });
  }

  return redirect("/logistics");
}

export default function LogisticsConfig() {
  const { shop, accounts, pickups, couriers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const byKey = new Map(accounts.map((a) => [a.courierKey, a]));

  return (
    <AppShell shop={shop}>
      <Page title="Logistics configuration" subtitle="Connect couriers and set pickup addresses">
        {actionData && "error" in actionData && actionData.error ? (
          <div style={{ marginBottom: 16 }}>
            <Badge tone="critical">{actionData.error}</Badge>
          </div>
        ) : null}
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Couriers
              </Text>
              {couriers.map((courier) => {
                const account = byKey.get(courier.key);
                return (
                  <Card key={courier.key}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h3" variant="headingSm">
                            {courier.displayName}
                          </Text>
                          {account ? (
                            <Badge tone={account.enabled ? "success" : undefined}>
                              {account.enabled ? "Connected" : "Disabled"}
                            </Badge>
                          ) : (
                            <Badge>Not connected</Badge>
                          )}
                          {account?.testMode ? <Badge tone="attention">Test mode</Badge> : null}
                        </InlineStack>
                        {account ? (
                          <InlineStack gap="200">
                            <Form method="post">
                              <input type="hidden" name="intent" value="toggle-testmode" />
                              <input type="hidden" name="courierKey" value={courier.key} />
                              <input type="hidden" name="testMode" value={String(!account.testMode)} />
                              <Button submit variant="tertiary">
                                {account.testMode ? "Switch to live" : "Switch to test"}
                              </Button>
                            </Form>
                            <Form method="post">
                              <input type="hidden" name="intent" value="toggle-enabled" />
                              <input type="hidden" name="courierKey" value={courier.key} />
                              <input type="hidden" name="enabled" value={String(!account.enabled)} />
                              <Button submit variant="tertiary" tone={account.enabled ? "critical" : undefined}>
                                {account.enabled ? "Disable" : "Enable"}
                              </Button>
                            </Form>
                          </InlineStack>
                        ) : null}
                      </InlineStack>

                      <Form method="post">
                        <input type="hidden" name="intent" value="connect-courier" />
                        <input type="hidden" name="courierKey" value={courier.key} />
                        <FormLayout>
                          {courier.credentialFields.map((field) => (
                            <TextField
                              key={field.name}
                              name={field.name}
                              label={field.label}
                              type={field.type === "password" ? "password" : "text"}
                              helpText={
                                field.help ??
                                (account?.configuredFields.includes(field.name)
                                  ? "Saved — leave blank to keep, or re-enter to replace."
                                  : undefined)
                              }
                              autoComplete="off"
                              requiredIndicator={field.required}
                            />
                          ))}
                          <Button submit variant="primary">
                            {account ? "Update credentials" : "Connect"}
                          </Button>
                        </FormLayout>
                      </Form>
                    </BlockStack>
                  </Card>
                );
              })}
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Pickup addresses
                </Text>
                {pickups.length === 0 ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Add a pickup address — it is the origin for every shipment.
                  </Text>
                ) : (
                  pickups.map((p) => (
                    <Card key={p.id} background="bg-surface-secondary">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" fontWeight="semibold">
                            {p.label}
                          </Text>
                          {p.isDefault ? <Badge tone="success">Default</Badge> : null}
                        </InlineStack>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {p.line1}, {p.city}, {p.state} - {p.pincode}
                        </Text>
                      </BlockStack>
                    </Card>
                  ))
                )}

                <Form method="post">
                  <input type="hidden" name="intent" value="add-pickup" />
                  <FormLayout>
                    <TextField name="label" label="Label" autoComplete="off" requiredIndicator />
                    <TextField name="contactName" label="Contact name" autoComplete="off" requiredIndicator />
                    <TextField name="phone" label="Phone" autoComplete="off" requiredIndicator />
                    <TextField name="line1" label="Address line 1" autoComplete="off" requiredIndicator />
                    <TextField name="line2" label="Address line 2" autoComplete="off" />
                    <FormLayout.Group>
                      <TextField name="city" label="City" autoComplete="off" requiredIndicator />
                      <TextField name="state" label="State" autoComplete="off" requiredIndicator />
                    </FormLayout.Group>
                    <TextField name="pincode" label="Pincode" autoComplete="off" requiredIndicator />
                    <label>
                      <input type="checkbox" name="isDefault" /> Set as default
                    </label>
                    <Button submit>Add pickup address</Button>
                  </FormLayout>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
