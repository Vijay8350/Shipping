import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { EVENT_LABELS, type NotificationChannel, type NotificationEvent } from "../lib/notifications/types";
import { TEMPLATE_VARIABLES } from "../lib/notifications/templates";
import { listTemplates, upsertTemplate } from "../services/notifications.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const templates = await listTemplates(shop);
  return json({ shop, templates, variables: TEMPLATE_VARIABLES });
}

export async function action({ request }: ActionFunctionArgs) {
  const shop = await requireShop(request);
  const form = await request.formData();
  await upsertTemplate(
    shop,
    String(form.get("event")) as NotificationEvent,
    String(form.get("channel")) as NotificationChannel,
    {
      subject: String(form.get("subject") || "") || undefined,
      body: String(form.get("body") || ""),
      enabled: form.get("enabled") === "on",
    },
  );
  return redirect("/notifications");
}

function TemplateCard({
  t,
}: {
  t: {
    event: NotificationEvent;
    channel: NotificationChannel;
    subject: string;
    body: string;
    enabled: boolean;
    isDefault: boolean;
  };
}) {
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const [enabled, setEnabled] = useState(t.enabled);

  return (
    <Card>
      <Form method="post">
        <input type="hidden" name="event" value={t.event} />
        <input type="hidden" name="channel" value={t.channel} />
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" fontWeight="semibold">
              {t.channel.toUpperCase()}
            </Text>
            {t.isDefault ? <Badge>Default</Badge> : <Badge tone="info">Customized</Badge>}
          </InlineStack>
          {t.channel === "email" ? (
            <TextField label="Subject" name="subject" value={subject} onChange={setSubject} autoComplete="off" />
          ) : null}
          <TextField
            label="Body"
            name="body"
            value={body}
            onChange={setBody}
            multiline={3}
            autoComplete="off"
          />
          <Checkbox label="Enabled (event fires on this channel)" checked={enabled} onChange={setEnabled} />
          <input type="hidden" name="enabled" value={enabled ? "on" : ""} />
          <div>
            <Button submit>Save</Button>
          </div>
        </BlockStack>
      </Form>
    </Card>
  );
}

export default function NotificationsPage() {
  const { shop, templates, variables } = useLoaderData<typeof loader>();

  // Group by event.
  const events = Array.from(new Set(templates.map((t) => t.event))) as NotificationEvent[];

  return (
    <AppShell shop={shop}>
      <Page title="Notification templates" subtitle="Email & SMS per event — disable to stop an event firing">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {events.map((event) => (
                <Card key={event}>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      {EVENT_LABELS[event]}
                    </Text>
                    <InlineStack gap="300" wrap align="start">
                      {templates
                        .filter((t) => t.event === event)
                        .map((t) => (
                          <div key={`${t.event}:${t.channel}`} style={{ minWidth: 320, flex: 1 }}>
                            <TemplateCard t={t} />
                          </div>
                        ))}
                    </InlineStack>
                  </BlockStack>
                </Card>
              ))}
            </BlockStack>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Variables</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Use these placeholders in subject/body:
                </Text>
                <BlockStack gap="100">
                  {variables.map((v) => (
                    <Text as="span" key={v} variant="bodySm">{`{{${v}}}`}</Text>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
