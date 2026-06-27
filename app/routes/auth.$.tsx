import type { LoaderFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";

/**
 * Shopify OAuth begin + callback (CLAUDE.md §2). The library handles the grant screen
 * redirect and the token exchange; on success the afterAuth hook (shopify.server.ts)
 * persists the encrypted offline token, sets our session cookie, and redirects to
 * /dashboard. There is no username/password — Shopify OAuth IS the login.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  // afterAuth throws a redirect to /dashboard, so this return is unreachable in
  // practice. Kept so the route always has a typed return.
  return null;
}
