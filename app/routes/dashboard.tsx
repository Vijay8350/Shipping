import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  BlockStack,
  Card,
  InlineGrid,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  return json({ shop });
}

export default function Dashboard() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <AppShell shop={shop}>
      <Page title="Dashboard">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Foundation ready
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Non-embedded app shell for <strong>{shop}</strong> is live on our own
                  domain (no admin iframe, cookie-session auth). Feature modules light up
                  in later build phases.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
              <Card>
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Orders
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Sync &amp; list — Phase 1
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Shipping
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Carriers &amp; AWBs — Phase 2
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Tracking
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Poller &amp; timeline — Phase 3
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>
        </Layout>
      </Page>
    </AppShell>
  );
}
