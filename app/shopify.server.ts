import "@shopify/shopify-app-remix/adapters/node";
import {
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

import prisma from "./db.server";
import { encrypt } from "./lib/crypto.server";
import { commitShopSession, getShopSession } from "./session.server";

/**
 * NON-EMBEDDED Shopify app (CLAUDE.md §2).
 *
 *  - isEmbeddedApp: false  -> no App Bridge, no admin iframe.
 *  - useOnlineTokens: false -> offline access tokens only.
 *  - Prisma cookie session storage backs the OAuth flow.
 *
 * Shopify OAuth IS the login; there is no username/password. After a successful
 * OAuth, afterAuth persists an ENCRYPTED offline token on the Shop row, sets our
 * own signed session cookie, and redirects to /dashboard.
 */
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  // apiVersion omitted -> library default (current stable GraphQL Admin API, CLAUDE.md §10).
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  isEmbeddedApp: false,
  useOnlineTokens: false,
  future: {
    unstable_newEmbeddedAuthStrategy: false,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  hooks: {
    afterAuth: async ({ session }) => {
      // Persist our own Shop record with the offline token encrypted at rest (§9.3).
      await prisma.shop.upsert({
        where: { shop: session.shop },
        update: {
          accessToken: session.accessToken ? encrypt(session.accessToken) : null,
          scope: session.scope ?? null,
          installState: "installed",
          uninstalledAt: null,
        },
        create: {
          shop: session.shop,
          accessToken: session.accessToken ? encrypt(session.accessToken) : null,
          scope: session.scope ?? null,
          installState: "installed",
        },
      });

      // Phase 1 will register webhooks here (orders/*, compliance topics, etc.).

      // Set our own signed session cookie and land on the dashboard (CLAUDE.md §2).
      const appSession = await getShopSession(new Request(process.env.SHOPIFY_APP_URL));
      appSession.set("shop", session.shop);
      throw new Response(null, {
        status: 302,
        headers: {
          Location: "/dashboard",
          "Set-Cookie": await commitShopSession(appSession),
        },
      });
    },
  },
});

export default shopify;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
