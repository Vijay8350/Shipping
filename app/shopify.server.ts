import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

import prisma from "./db.server";
import { encrypt } from "./lib/crypto.server";
import { enqueueOrderBackfill } from "./lib/queues.server";

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
  // Pinned to match shopify.app toml [webhooks] api_version and ADMIN_API_VERSION (§10).
  apiVersion: ApiVersion.October25,
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
  // App-managed webhooks (CLAUDE.md §10). All delivered to /webhooks and HMAC-verified
  // there. The 3 mandatory compliance topics (§9.5) are declared in shopify.app.toml
  // (privacy_compliance) and hit the same endpoint.
  webhooks: {
    ORDERS_CREATE: { deliveryMethod: DeliveryMethod.Http, callbackUrl: "/webhooks" },
    ORDERS_UPDATED: { deliveryMethod: DeliveryMethod.Http, callbackUrl: "/webhooks" },
    ORDERS_CANCELLED: { deliveryMethod: DeliveryMethod.Http, callbackUrl: "/webhooks" },
    FULFILLMENTS_CREATE: { deliveryMethod: DeliveryMethod.Http, callbackUrl: "/webhooks" },
    APP_UNINSTALLED: { deliveryMethod: DeliveryMethod.Http, callbackUrl: "/webhooks" },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      // Register the webhook subscriptions for this shop.
      await shopify.registerWebhooks({ session });
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

      // Kick off a recent-order backfill in the worker (never inline, §5). Idempotent:
      // coalesced per shop via a stable jobId.
      await enqueueOrderBackfill({ shop: session.shop, limit: 100 });

      // NOTE: do NOT throw a redirect/Response here — this shopify-app-remix version
      // treats a thrown Response in afterAuth as an error (500), even though OAuth
      // already succeeded. The library redirects to "/" after auth, and our `_index`
      // route performs the SSO ("offline session exists → set our cookie → /dashboard",
      // CLAUDE.md §2). So afterAuth only does side-effects and returns.
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
