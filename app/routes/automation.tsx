import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Banner,
  Button,
  Card,
  Checkbox,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { listCourierAccounts } from "../services/courier-accounts.server";
import {
  createRule,
  deleteRule,
  listRules,
  setRuleEnabled,
  type AutomationActionType,
  type AutomationTrigger,
} from "../services/automation.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const [rules, couriers] = await Promise.all([listRules(shop), listCourierAccounts(shop)]);
  return json({
    shop,
    rules: rules.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      action: r.action as { type: string; courierKey?: string; cod?: boolean; weightGrams?: number },
      enabled: r.enabled,
    })),
    couriers: couriers.filter((c) => c.enabled).map((c) => c.courierKey),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const shop = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "toggle") {
    await setRuleEnabled(shop, String(form.get("id")), form.get("enabled") === "true");
  } else if (intent === "delete") {
    await deleteRule(shop, String(form.get("id")));
  } else if (intent === "create") {
    await createRule(shop, {
      trigger: String(form.get("trigger")) as AutomationTrigger,
      action: {
        type: String(form.get("actionType")) as AutomationActionType,
        courierKey: String(form.get("courierKey")) || undefined,
        cod: form.get("cod") === "on",
        weightGrams: Math.max(1, Number(form.get("weightGrams") || 500)),
      },
      enabled: true,
    });
  }
  return redirect("/automation");
}

const TRIGGER_LABEL: Record<string, string> = {
  order_created: "When an order is created",
  order_paid: "When an order is paid",
};

export default function AutomationPage() {
  const { shop, rules, couriers } = useLoaderData<typeof loader>();
  const [trigger, setTrigger] = useState("order_created");
  const [actionType, setActionType] = useState("assign_courier");
  const [courierKey, setCourierKey] = useState(couriers[0] ?? "");
  const [cod, setCod] = useState(false);
  const [weight, setWeight] = useState("500");

  return (
    <AppShell shop={shop}>
      <Page title="Automation Rules" subtitle="Auto-assign a courier or auto-ship orders as they arrive">
        <Layout>
          <Layout.Section>
            <BlockStack gap="300">
              {rules.length === 0 ? (
                <Banner tone="info">No rules yet. Create one on the right to automate shipping.</Banner>
              ) : (
                rules.map((r) => (
                  <Card key={r.id}>
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="span" fontWeight="semibold">
                          {TRIGGER_LABEL[r.trigger] ?? r.trigger}
                        </Text>
                        <Text as="span" tone="subdued" variant="bodySm">
                          {r.action.type === "auto_ship" ? "Auto-ship" : "Assign courier"}
                          {r.action.courierKey ? ` · ${r.action.courierKey}` : ""}
                          {r.action.cod ? " · COD" : ""}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="300" blockAlign="center">
                        <Badge tone={r.enabled ? "success" : undefined}>
                          {r.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Form method="post">
                          <input type="hidden" name="intent" value="toggle" />
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="enabled" value={r.enabled ? "false" : "true"} />
                          <Button submit variant="tertiary">
                            {r.enabled ? "Disable" : "Enable"}
                          </Button>
                        </Form>
                        <Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={r.id} />
                          <Button submit variant="tertiary" tone="critical">
                            Delete
                          </Button>
                        </Form>
                      </InlineStack>
                    </InlineStack>
                  </Card>
                ))
              )}
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <Form method="post">
                <input type="hidden" name="intent" value="create" />
                <input type="hidden" name="courierKey" value={courierKey} />
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">New rule</Text>
                  <FormLayout>
                    <Select
                      label="Trigger"
                      options={[
                        { label: "When an order is created", value: "order_created" },
                        { label: "When an order is paid", value: "order_paid" },
                      ]}
                      name="trigger"
                      value={trigger}
                      onChange={setTrigger}
                    />
                    <Select
                      label="Action"
                      options={[
                        { label: "Assign courier (tag for shipping)", value: "assign_courier" },
                        { label: "Auto-ship (create AWB immediately)", value: "auto_ship" },
                      ]}
                      name="actionType"
                      value={actionType}
                      onChange={setActionType}
                    />
                    {couriers.length === 0 ? (
                      <Banner tone="warning">Connect a courier in Logistics Config first.</Banner>
                    ) : (
                      <Select
                        label="Courier"
                        options={couriers.map((c) => ({ label: c, value: c }))}
                        value={courierKey}
                        onChange={setCourierKey}
                      />
                    )}
                    <TextField label="Weight (grams)" type="number" name="weightGrams" value={weight} onChange={setWeight} autoComplete="off" />
                    <Checkbox label="Cash on delivery" checked={cod} onChange={setCod} />
                    <input type="hidden" name="cod" value={cod ? "on" : ""} />
                    <Button submit variant="primary" disabled={couriers.length === 0}>
                      Create rule
                    </Button>
                  </FormLayout>
                </BlockStack>
              </Form>
            </Card>
            <div style={{ marginTop: 12 }}>
              <Banner tone="info">
                Auto-ship uses the idempotent ship workflow — a repeat never creates a duplicate AWB.
                Rules run in the background worker as orders sync.
              </Banner>
            </div>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
