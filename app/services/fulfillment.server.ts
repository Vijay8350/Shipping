import prisma from "../db.server";
import { decrypt } from "../lib/crypto.server";
import { getCourierMeta } from "../lib/carriers/registry";
import { adminGraphql } from "../lib/shopify/admin-graphql.server";
import { trackingUrl } from "./tracking.server";

/**
 * Push a Fulfillment (with tracking number + URL) back to Shopify (CLAUDE.md §10,
 * BUILD-PHASES Phase 3 item 2). Idempotent: once a shipment has a shopifyFulfillmentId we
 * skip. Uses the GraphQL Admin API with the merchant's offline token (scope
 * write_merchant_managed_fulfillment_orders).
 *
 * GraphQL shapes follow Shopify's documented fulfillment flow; validate against a live
 * store before production (§14).
 */

const FULFILLMENT_ORDERS_QUERY = /* GraphQL */ `
  query FulfillmentOrders($id: ID!) {
    order(id: $id) {
      fulfillmentOrders(first: 10) {
        edges { node { id status } }
      }
    }
  }
`;

const FULFILLMENT_CREATE = /* GraphQL */ `
  mutation FulfillmentCreate($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment { id status trackingInfo { number url } }
      userErrors { field message }
    }
  }
`;

interface FulfillmentOrdersResult {
  order?: {
    fulfillmentOrders?: { edges?: Array<{ node?: { id: string; status: string } }> };
  };
}

interface FulfillmentCreateResult {
  fulfillmentCreateV2?: {
    fulfillment?: { id: string; status: string } | null;
    userErrors?: Array<{ field?: string[]; message: string }>;
  };
}

export async function pushFulfillmentForShipment(shipmentId: string): Promise<{
  pushed: boolean;
  reason?: string;
}> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { order: true, shop: true },
  });
  if (!shipment) return { pushed: false, reason: "shipment not found" };
  if (shipment.shopifyFulfillmentId) return { pushed: false, reason: "already fulfilled" };
  if (!shipment.shop.accessToken) return { pushed: false, reason: "no offline token" };

  const token = decrypt(shipment.shop.accessToken);
  const shopDomain = shipment.shop.shop;

  // Find open fulfillment orders for this Shopify order.
  const foData = await adminGraphql<FulfillmentOrdersResult>(
    shopDomain,
    token,
    FULFILLMENT_ORDERS_QUERY,
    { id: shipment.order.shopifyId },
  );
  const openFulfillmentOrders = (foData.order?.fulfillmentOrders?.edges ?? [])
    .map((e) => e.node)
    .filter((n): n is { id: string; status: string } => Boolean(n))
    .filter((n) => n.status === "OPEN" || n.status === "IN_PROGRESS");

  if (openFulfillmentOrders.length === 0) {
    return { pushed: false, reason: "no open fulfillment orders" };
  }

  const result = await adminGraphql<FulfillmentCreateResult>(
    shopDomain,
    token,
    FULFILLMENT_CREATE,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder: openFulfillmentOrders.map((fo) => ({
          fulfillmentOrderId: fo.id,
        })),
        notifyCustomer: false,
        trackingInfo: {
          number: shipment.awb,
          url: trackingUrl(shipment.courierKey, shipment.awb),
          company: getCourierMeta(shipment.courierKey)?.displayName ?? shipment.courierKey,
        },
      },
    },
  );

  const errors = result.fulfillmentCreateV2?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Shopify fulfillment errors: ${errors.map((e) => e.message).join("; ")}`);
  }

  const fulfillmentId = result.fulfillmentCreateV2?.fulfillment?.id;
  if (fulfillmentId) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { shopifyFulfillmentId: fulfillmentId },
    });
    await prisma.order.update({
      where: { id: shipment.orderId },
      data: { fulfillmentStatus: "fulfilled" },
    });
  }

  return { pushed: Boolean(fulfillmentId) };
}
