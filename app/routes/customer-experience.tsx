import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  FormLayout,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import {
  getStorefrontConfig,
  upsertStorefrontConfig,
} from "../services/storefront-settings.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const config = await getStorefrontConfig(shop);
  return json({ shop, config });
}

export async function action({ request }: ActionFunctionArgs) {
  const shop = await requireShop(request);
  const form = await request.formData();
  await upsertStorefrontConfig(shop, {
    logoUrl: String(form.get("logoUrl") || "") || null,
    themeColor: String(form.get("themeColor") || "#1a73e8"),
    customCss: String(form.get("customCss") || "") || null,
    dateFormat: String(form.get("dateFormat") || "DD MMM YYYY"),
    supportEmail: String(form.get("supportEmail") || "") || null,
    trackingEnabled: form.get("trackingEnabled") === "on",
    eddEnabled: form.get("eddEnabled") === "on",
    returnsEnabled: form.get("returnsEnabled") === "on",
    eddMinDays: Math.max(0, Number(form.get("eddMinDays") || 2)),
    eddMaxDays: Math.max(0, Number(form.get("eddMaxDays") || 7)),
  });
  return redirect("/customer-experience");
}

export default function CustomerExperience() {
  const { shop, config } = useLoaderData<typeof loader>();
  const [c, setC] = useState(config);
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) => setC((p) => ({ ...p, [k]: v }));

  return (
    <AppShell shop={shop}>
      <Page title="Customer experience" subtitle="Branding for the storefront tracking page, EDD, and returns">
        <Form method="post">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Branding</Text>
                  <FormLayout>
                    <TextField label="Logo URL" name="logoUrl" value={c.logoUrl ?? ""} onChange={(v) => set("logoUrl", v)} autoComplete="off" />
                    <TextField label="Theme color (hex)" name="themeColor" value={c.themeColor} onChange={(v) => set("themeColor", v)} autoComplete="off" />
                    <TextField label="Support email" name="supportEmail" value={c.supportEmail ?? ""} onChange={(v) => set("supportEmail", v)} autoComplete="off" />
                    <TextField label="Date format label" name="dateFormat" value={c.dateFormat} onChange={(v) => set("dateFormat", v)} autoComplete="off" />
                    <TextField label="Custom CSS" name="customCss" value={c.customCss ?? ""} onChange={(v) => set("customCss", v)} multiline={4} autoComplete="off" />
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Surfaces</Text>
                    <Checkbox label="Branded tracking page" checked={c.trackingEnabled} onChange={(v) => set("trackingEnabled", v)} />
                    <input type="hidden" name="trackingEnabled" value={c.trackingEnabled ? "on" : ""} />
                    <Checkbox label="Estimated delivery date (EDD)" checked={c.eddEnabled} onChange={(v) => set("eddEnabled", v)} />
                    <input type="hidden" name="eddEnabled" value={c.eddEnabled ? "on" : ""} />
                    <Checkbox label="Self-service returns page" checked={c.returnsEnabled} onChange={(v) => set("returnsEnabled", v)} />
                    <input type="hidden" name="returnsEnabled" value={c.returnsEnabled ? "on" : ""} />
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Transit window (EDD fallback)</Text>
                    <FormLayout.Group>
                      <TextField label="Min days" type="number" name="eddMinDays" value={String(c.eddMinDays)} onChange={(v) => set("eddMinDays", Number(v))} autoComplete="off" />
                      <TextField label="Max days" type="number" name="eddMaxDays" value={String(c.eddMaxDays)} onChange={(v) => set("eddMaxDays", Number(v))} autoComplete="off" />
                    </FormLayout.Group>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Storefront URLs</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Via the App Proxy (subpath <code>ils</code>):</Text>
                    <Text as="p" variant="bodySm">/apps/ils/track?awb=…</Text>
                    <Text as="p" variant="bodySm">/apps/ils/returns</Text>
                    <Text as="p" variant="bodySm">/apps/ils/edd?pincode=…</Text>
                  </BlockStack>
                </Card>
                <Button submit variant="primary">Save settings</Button>
              </BlockStack>
            </Layout.Section>
          </Layout>
        </Form>
        <div style={{ marginTop: 16 }}>
          <Banner tone="info">
            These pages render on your storefront through the Shopify App Proxy. Add links or a
            theme block pointing to the URLs above.
          </Banner>
        </div>
      </Page>
    </AppShell>
  );
}
