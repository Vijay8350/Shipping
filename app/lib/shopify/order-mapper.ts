/**
 * Pure mappers: Shopify order payloads -> our Order row shape.
 *
 * Two source shapes feed the same target:
 *   - REST/webhook JSON (snake_case) from orders/create, orders/updated, orders/cancelled.
 *   - GraphQL Admin API nodes (camelCase, GID ids) from the backfill.
 *
 * Money is normalized to integer MINOR units + currency (CLAUDE.md §11). Pure & no I/O
 * so it is unit-tested directly.
 */

export interface OrderData {
  shopifyId: string; // always a GID: gid://shopify/Order/<n>
  name: string;
  email: string | null;
  customerName: string | null;
  phone: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  totalPrice: number; // minor units
  currency: string;
  lineItemsCount: number;
  shippingName: string | null;
  shippingAddress1: string | null;
  shippingAddress2: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingZip: string | null;
  shippingCountry: string | null;
  tags: string | null;
  shopifyCreatedAt: Date | null;
  shopifyUpdatedAt: Date | null;
  cancelledAt: Date | null;
}

/** Convert a decimal money string (e.g. "1234.50") to integer minor units (123450). */
export function toMinorUnits(amount: string | number | null | undefined): number {
  if (amount == null) return 0;
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function toOrderGid(id: string | number): string {
  const s = String(id);
  return s.startsWith("gid://") ? s : `gid://shopify/Order/${s}`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function joinName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | null {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || null;
}

// ── REST / webhook payload (snake_case) ─────────────────────────────────────
interface RestOrder {
  id: number | string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  total_price?: string | null;
  currency?: string | null;
  tags?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  cancelled_at?: string | null;
  line_items?: Array<{ quantity?: number }>;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
  shipping_address?: {
    name?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;
}

export function mapRestOrder(payload: RestOrder): OrderData {
  const ship = payload.shipping_address ?? null;
  return {
    shopifyId: toOrderGid(payload.id),
    name: payload.name ?? `#${payload.id}`,
    email: payload.email ?? null,
    customerName: joinName(
      payload.customer?.first_name,
      payload.customer?.last_name,
    ),
    phone: payload.phone ?? null,
    financialStatus: payload.financial_status ?? null,
    fulfillmentStatus: payload.fulfillment_status ?? "unfulfilled",
    totalPrice: toMinorUnits(payload.total_price),
    currency: payload.currency ?? "INR",
    lineItemsCount: (payload.line_items ?? []).reduce(
      (sum, li) => sum + (li.quantity ?? 1),
      0,
    ),
    shippingName: ship?.name ?? null,
    shippingAddress1: ship?.address1 ?? null,
    shippingAddress2: ship?.address2 ?? null,
    shippingCity: ship?.city ?? null,
    shippingProvince: ship?.province ?? null,
    shippingZip: ship?.zip ?? null,
    shippingCountry: ship?.country ?? null,
    tags: payload.tags ?? null,
    shopifyCreatedAt: parseDate(payload.created_at),
    shopifyUpdatedAt: parseDate(payload.updated_at),
    cancelledAt: parseDate(payload.cancelled_at),
  };
}

// ── GraphQL Admin API node (camelCase) ──────────────────────────────────────
export interface GraphqlOrderNode {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  cancelledAt?: string | null;
  tags?: string[] | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  currentTotalPriceSet?: {
    shopMoney?: { amount?: string | null; currencyCode?: string | null } | null;
  } | null;
  subtotalLineItemsQuantity?: number | null;
  customer?: { firstName?: string | null; lastName?: string | null } | null;
  shippingAddress?: {
    name?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;
}

export function mapGraphqlOrder(node: GraphqlOrderNode): OrderData {
  const money = node.currentTotalPriceSet?.shopMoney;
  const ship = node.shippingAddress ?? null;
  return {
    shopifyId: node.id,
    name: node.name,
    email: node.email ?? null,
    customerName: joinName(node.customer?.firstName, node.customer?.lastName),
    phone: node.phone ?? null,
    financialStatus: node.displayFinancialStatus?.toLowerCase() ?? null,
    fulfillmentStatus: node.displayFulfillmentStatus?.toLowerCase() ?? null,
    totalPrice: toMinorUnits(money?.amount),
    currency: money?.currencyCode ?? "INR",
    lineItemsCount: node.subtotalLineItemsQuantity ?? 0,
    shippingName: ship?.name ?? null,
    shippingAddress1: ship?.address1 ?? null,
    shippingAddress2: ship?.address2 ?? null,
    shippingCity: ship?.city ?? null,
    shippingProvince: ship?.province ?? null,
    shippingZip: ship?.zip ?? null,
    shippingCountry: ship?.country ?? null,
    tags: node.tags?.length ? node.tags.join(", ") : null,
    shopifyCreatedAt: parseDate(node.createdAt),
    shopifyUpdatedAt: parseDate(node.updatedAt),
    cancelledAt: parseDate(node.cancelledAt),
  };
}
