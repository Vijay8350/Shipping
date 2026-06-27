import prisma from "../db.server";
import { decrypt } from "../lib/crypto.server";
import { adminGraphql } from "../lib/shopify/admin-graphql.server";
import {
  mapGraphqlOrder,
  type GraphqlOrderNode,
  type OrderData,
} from "../lib/shopify/order-mapper";

/**
 * Order persistence + Shopify backfill (CLAUDE.md §10, BUILD-PHASES Phase 1). Business
 * logic lives here; routes and the worker stay thin (§11).
 */

/** Resolve a Shop row id by domain (the row exists post-OAuth via afterAuth). */
async function getShopId(shopDomain: string): Promise<string | null> {
  const shop = await prisma.shop.findUnique({
    where: { shop: shopDomain },
    select: { id: true },
  });
  return shop?.id ?? null;
}

/** Idempotent upsert of one order, keyed by (shopId, shopifyId). */
export async function upsertOrder(shopDomain: string, data: OrderData) {
  const shopId = await getShopId(shopDomain);
  if (!shopId) {
    throw new Error(`upsertOrder: no Shop row for ${shopDomain}`);
  }

  const fields = {
    name: data.name,
    email: data.email,
    customerName: data.customerName,
    phone: data.phone,
    financialStatus: data.financialStatus,
    fulfillmentStatus: data.fulfillmentStatus,
    totalPrice: data.totalPrice,
    currency: data.currency,
    lineItemsCount: data.lineItemsCount,
    shippingName: data.shippingName,
    shippingAddress1: data.shippingAddress1,
    shippingAddress2: data.shippingAddress2,
    shippingCity: data.shippingCity,
    shippingProvince: data.shippingProvince,
    shippingZip: data.shippingZip,
    shippingCountry: data.shippingCountry,
    tags: data.tags,
    shopifyCreatedAt: data.shopifyCreatedAt,
    shopifyUpdatedAt: data.shopifyUpdatedAt,
    cancelledAt: data.cancelledAt,
    syncStatus: "synced",
  };

  return prisma.order.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
    create: { shopId, shopifyId: data.shopifyId, ...fields },
    update: fields,
  });
}

const BACKFILL_QUERY = /* GraphQL */ `
  query OrdersBackfill($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          email
          phone
          createdAt
          updatedAt
          cancelledAt
          tags
          displayFinancialStatus
          displayFulfillmentStatus
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          subtotalLineItemsQuantity
          customer { firstName lastName }
          shippingAddress { name address1 address2 city province zip country }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface OrdersQueryResult {
  orders: {
    edges: Array<{ node: GraphqlOrderNode }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

/**
 * Pull recent orders for a shop into the Order table (Phase 1 backfill). Paginates the
 * GraphQL Admin API until `limit` is reached. Returns the number of orders upserted.
 */
export async function backfillOrders(
  shopDomain: string,
  limit = 100,
): Promise<number> {
  const shop = await prisma.shop.findUnique({
    where: { shop: shopDomain },
    select: { id: true, accessToken: true },
  });
  if (!shop?.accessToken) {
    throw new Error(`backfillOrders: no offline token for ${shopDomain}`);
  }
  const token = decrypt(shop.accessToken);

  let upserted = 0;
  let after: string | null = null;
  const pageSize = Math.min(50, limit);

  while (upserted < limit) {
    const data: OrdersQueryResult = await adminGraphql<OrdersQueryResult>(
      shopDomain,
      token,
      BACKFILL_QUERY,
      { first: pageSize, after },
    );

    const edges = data.orders.edges;
    if (edges.length === 0) break;

    for (const edge of edges) {
      await upsertOrder(shopDomain, mapGraphqlOrder(edge.node));
      upserted += 1;
      if (upserted >= limit) break;
    }

    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }

  return upserted;
}

/** Mark a shop uninstalled and clear its sessions (app/uninstalled, Phase 1). */
export async function markShopUninstalled(shopDomain: string): Promise<void> {
  await prisma.$transaction([
    prisma.shop.updateMany({
      where: { shop: shopDomain },
      data: {
        installState: "uninstalled",
        uninstalledAt: new Date(),
        accessToken: null,
      },
    }),
    prisma.session.deleteMany({ where: { shop: shopDomain } }),
  ]);
}
