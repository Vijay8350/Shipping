import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import prisma from "../db.server";
import { commitShopSession, getLoggedInShop, getShopSession } from "../session.server";

/**
 * App entry / SSO decision point (CLAUDE.md §2).
 *
 * Shopify opens our App URL (this route) with ?shop=&host=. We:
 *   1. If our own session cookie is already valid -> /dashboard.
 *   2. Else if a valid OFFLINE session exists for the shop -> set cookie -> /dashboard.
 *   3. Else -> begin Shopify OAuth (/auth?shop=...). OAuth IS the login.
 *   4. No shop param and not logged in -> /auth/login to enter a shop domain.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");

  // 1. Already logged in on our domain.
  const loggedInShop = await getLoggedInShop(request);
  if (loggedInShop) {
    return redirect("/dashboard");
  }

  // 2. Offline session present for this shop? -> single sign-on, no OAuth needed.
  if (shopParam) {
    const offline = await prisma.session.findFirst({
      where: { shop: shopParam, isOnline: false, accessToken: { not: "" } },
    });

    if (offline?.accessToken) {
      const session = await getShopSession(request);
      session.set("shop", shopParam);
      return redirect("/dashboard", {
        headers: { "Set-Cookie": await commitShopSession(session) },
      });
    }

    // 3. No offline session -> run OAuth.
    return redirect(`/auth?shop=${encodeURIComponent(shopParam)}`);
  }

  // 4. Cold entry without a shop -> ask for the shop domain.
  return redirect("/auth/login");
}
