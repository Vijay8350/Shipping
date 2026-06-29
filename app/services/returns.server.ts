import prisma from "../db.server";
import { enqueueNotification } from "../lib/queues.server";
import { assertTransition, type ReturnState } from "../lib/returns-state";
import { getAdapterForShop } from "./courier-accounts.server";
import { getDefaultPickupAddress, toAdapterAddress } from "./pickup-addresses.server";

/**
 * Returns lifecycle (CLAUDE.md Phase 4). State transitions are validated against the
 * returns-state machine. Accepting a return generates a reverse-pickup AWB via the
 * carrier adapter (swapped addresses: customer -> warehouse) and queues the customer
 * email through the notification dispatcher.
 *
 * NOTE: reverse pickups use createShipment with swapped addresses; some couriers need a
 * dedicated reverse/QC flag — validate against the live API before production (§14).
 */

async function getShopId(shopDomain: string): Promise<string> {
  const shop = await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { id: true } });
  if (!shop) throw new Error(`No Shop row for ${shopDomain}`);
  return shop.id;
}

export async function listReturns(shopDomain: string) {
  const shopId = await getShopId(shopDomain);
  return prisma.return.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { order: { select: { id: true, name: true, customerName: true, email: true } } },
  });
}

/** Create a return request (PENDING). Phase 5 wires the storefront page to this. */
export async function createReturn(
  shopDomain: string,
  input: { orderId: string; reason?: string; customerNote?: string },
) {
  const shopId = await getShopId(shopDomain);
  const order = await prisma.order.findFirst({ where: { id: input.orderId, shopId } });
  if (!order) throw new Error("Order not found");
  return prisma.return.create({
    data: {
      shopId,
      orderId: order.id,
      reason: input.reason,
      customerNote: input.customerNote,
      status: "PENDING",
    },
  });
}

/**
 * Customer self-service return (CLAUDE.md §10, Phase 5). Matches the order by name +
 * email, then opens a PENDING return that lands in the admin Return Requests list.
 */
export async function createStorefrontReturn(
  shopDomain: string,
  input: { orderName: string; email: string; reason?: string; note?: string },
) {
  const shopId = await getShopId(shopDomain);
  const name = input.orderName.trim();
  const order = await prisma.order.findFirst({
    where: {
      shopId,
      email: { equals: input.email.trim(), mode: "insensitive" },
      name: { in: [name, name.startsWith("#") ? name.slice(1) : `#${name}`] },
    },
  });
  if (!order) throw new Error("We couldn't find an order with that number and email.");

  return prisma.return.create({
    data: {
      shopId,
      orderId: order.id,
      reason: input.reason,
      customerNote: input.note,
      status: "PENDING",
    },
  });
}

export async function declineReturn(shopDomain: string, returnId: string) {
  const shopId = await getShopId(shopDomain);
  const ret = await prisma.return.findFirst({ where: { id: returnId, shopId } });
  if (!ret) throw new Error("Return not found");
  assertTransition(ret.status as ReturnState, "DECLINED");
  return prisma.return.update({
    where: { id: ret.id },
    data: { status: "DECLINED", resolvedAt: new Date() },
  });
}

/** Accept a return: create the reverse-pickup AWB and notify the customer. */
export async function acceptReturn(
  shopDomain: string,
  returnId: string,
  courierKeyOverride?: string,
) {
  const shopId = await getShopId(shopDomain);
  const ret = await prisma.return.findFirst({
    where: { id: returnId, shopId },
    include: { order: { include: { shipments: { orderBy: { createdAt: "desc" } } } } },
  });
  if (!ret) throw new Error("Return not found");
  assertTransition(ret.status as ReturnState, "APPROVED");

  const order = ret.order;
  const courierKey = courierKeyOverride || order.shipments[0]?.courierKey;
  if (!courierKey) throw new Error("No courier available for the reverse pickup.");

  const warehouse = await getDefaultPickupAddress(shopDomain);
  if (!warehouse) throw new Error("Set a pickup address in Logistics Config first.");
  if (!order.shippingAddress1 || !order.shippingZip || !order.shippingCity) {
    throw new Error("Order is missing the customer address needed for reverse pickup.");
  }

  const adapter = await getAdapterForShop(shopDomain, courierKey);
  // Reverse leg: pickup FROM the customer, deliver TO the warehouse.
  const result = await adapter.createShipment({
    orderName: `RET-${order.name}`,
    reference: `return_${ret.id}`,
    pickup: {
      name: order.shippingName || order.customerName || "Customer",
      phone: order.phone || "",
      line1: order.shippingAddress1,
      line2: order.shippingAddress2 ?? undefined,
      city: order.shippingCity,
      state: order.shippingProvince || "",
      pincode: order.shippingZip,
      country: order.shippingCountry || "India",
    },
    delivery: toAdapterAddress(warehouse),
    parcel: { weightGrams: 500 },
    cod: false,
    declaredValue: order.totalPrice,
    items: [{ name: `Return ${order.name}`, quantity: 1, price: order.totalPrice }],
  });

  const updated = await prisma.return.update({
    where: { id: ret.id },
    data: {
      status: "IN_TRANSIT",
      reverseAwb: result.awb,
      reverseCourierKey: courierKey,
      reverseExternalShipmentId: result.externalShipmentId,
      reverseRawStatus: result.rawStatus,
    },
  });

  await enqueueNotification({
    shopId,
    event: "RETURN_ACCEPTED",
    recipientEmail: order.email,
    recipientPhone: order.phone,
    variables: {
      order_name: order.name,
      customer_name: order.customerName ?? "",
      awb: result.awb,
      courier: courierKey,
    },
  });

  return updated;
}

export async function markReturnReceived(shopDomain: string, returnId: string) {
  const shopId = await getShopId(shopDomain);
  const ret = await prisma.return.findFirst({
    where: { id: returnId, shopId },
    include: { order: { select: { name: true, customerName: true, email: true, phone: true } } },
  });
  if (!ret) throw new Error("Return not found");
  assertTransition(ret.status as ReturnState, "RECEIVED");

  const updated = await prisma.return.update({
    where: { id: ret.id },
    data: { status: "RECEIVED", resolvedAt: new Date() },
  });

  await enqueueNotification({
    shopId,
    event: "RETURN_RECEIVED",
    recipientEmail: ret.order.email,
    recipientPhone: ret.order.phone,
    variables: {
      order_name: ret.order.name,
      customer_name: ret.order.customerName ?? "",
    },
  });

  return updated;
}
