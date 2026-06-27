import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
  Button,
} from "@shopify/polaris";
import { LoginErrorType } from "@shopify/shopify-app-remix/server";

import { login } from "../shopify.server";
import { PolarisOnly } from "../components/AppShell";

/** Map the library's LoginError into human-readable field errors. */
function loginErrorMessage(loginErrors: { shop?: LoginErrorType }): {
  shop?: string;
} {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  }
  if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain, e.g. example.myshopify.com" };
  }
  return {};
}

/**
 * Shop-domain entry screen for cold starts (no shop param). Submitting a shop kicks
 * off OAuth via the library's `login` (CLAUDE.md §2). This is NOT a username/password
 * form — it only collects which Shopify store to authenticate.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const errors = loginErrorMessage(await login(request));
  return json({ errors });
}

export async function action({ request }: ActionFunctionArgs) {
  const errors = loginErrorMessage(await login(request));
  return json({ errors });
}

export default function LoginPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const errors = actionData?.errors || loaderData.errors;

  return (
    <PolarisOnly>
      <Page narrowWidth title="Shipping Management">
        <Card>
          <Form method="post">
            <FormLayout>
              <Text as="p" variant="bodyMd">
                Connect your Shopify store to continue. You&apos;ll be redirected to
                Shopify to approve access — there is no separate password.
              </Text>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="example.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
                error={errors?.shop}
              />
              <Button submit variant="primary">
                Connect store
              </Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisOnly>
  );
}
