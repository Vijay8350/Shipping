import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { destroyShopSession } from "../session.server";

/**
 * Clears our own session cookie (CLAUDE.md §2). The offline Shopify token stays in
 * storage — logging back in via the admin re-uses it (SSO), no re-OAuth needed.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  return redirect("/auth/login", {
    headers: { "Set-Cookie": await destroyShopSession(request) },
  });
}
