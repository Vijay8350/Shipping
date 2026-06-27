import { createCookieSessionStorage, redirect } from "@remix-run/node";

/**
 * Our OWN signed session cookie (CLAUDE.md §2).
 *
 * This is the login state on our domain. Once OAuth completes, the cookie holds the
 * shop domain; every authenticated page checks it. This is separate from Shopify's
 * Prisma session storage (which holds the offline OAuth token).
 */
const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__shipping_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET || "dev-insecure-session-secret"],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

export function getShopSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function commitShopSession(
  session: Awaited<ReturnType<typeof getShopSession>>,
) {
  return sessionStorage.commitSession(session);
}

/** Returns the logged-in shop domain, or null if not authenticated. */
export async function getLoggedInShop(request: Request): Promise<string | null> {
  const session = await getShopSession(request);
  return (session.get("shop") as string | undefined) ?? null;
}

/** Guard for authenticated pages: returns the shop or redirects to login. */
export async function requireShop(request: Request): Promise<string> {
  const shop = await getLoggedInShop(request);
  if (!shop) {
    throw redirect("/auth/login");
  }
  return shop;
}

export async function destroyShopSession(request: Request): Promise<string> {
  const session = await getShopSession(request);
  return sessionStorage.destroySession(session);
}
