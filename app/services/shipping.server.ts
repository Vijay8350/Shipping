import { Prisma, type Shipment } from "@prisma/client";

import prisma from "../db.server";
import type { Address, ServiceabilityOption } from "../lib/carriers/types";
import { getAdapterForShop } from "./courier-accounts.server";
import { getDefaultPickupAddress, toAdapterAddress } from "./pickup-addresses.server";
import { recordShipmentUsage } from "./usage.server";

/**
 * The ship workflow (CLAUDE.md §7, §9). Idempotent AWB creation is the central
 * non-negotiable: an idempotencyKey is generated per (order + courier) BEFORE calling the
 * adapter; if a Shipment with that key already exists we return it — never a duplicate AWB,
 * never double-metered usage.
 */

/** Deterministic per (order + courier) idempotency key (§9.1). */
export function idempotencyKeyFor(orderId: string, courierKey: string): string {
  return `${orderId}:${courierKey}`;
}

export interface ShipInput {
  orderId: string;
  courierKey: string;
  weightGrams: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  cod: boolean;
  codAmount?: number; // minor units
  courierId?: string | number; // chosen courier service (Shiprocket)
  serviceType?: string;
}

export interface ShipOutcome {
  shipment: Shipment;
  idempotent: boolean; // true if an existing shipment was returned (no new AWB created)
}

function deliveryAddressFromOrder(order: {
  shippingName: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  shippingAddress1: string | null;
  shippingAddress2: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingZip: string | null;
  shippingCountry: string | null;
}): Address {
  if (!order.shippingZip || !order.shippingCity || !order.shippingAddress1) {
    throw new Error("Order is missing a shipping address (street/city/pincode).");
  }
  return {
    name: order.shippingName || order.customerName || "Customer",
    phone: order.phone || "",
    email: order.email || undefined,
    line1: order.shippingAddress1,
    line2: order.shippingAddress2 ?? undefined,
    city: order.shippingCity,
    state: order.shippingProvince || "",
    pincode: order.shippingZip,
    country: order.shippingCountry || "India",
  };
}

export async function checkServiceabilityForOrder(
  shopDomain: string,
  orderId: string,
  courierKey: string,
  weightGrams: number,
): Promise<{ serviceable: boolean; options: ServiceabilityOption[] }> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  const pickup = await getDefaultPickupAddress(shopDomain);
  if (!pickup) throw new Error("Set a pickup address in Logistics Config first.");
  if (!order.shippingZip) throw new Error("Order has no destination pincode.");

  const adapter = await getAdapterForShop(shopDomain, courierKey);
  const res = await adapter.checkServiceability({
    fromPincode: pickup.pincode,
    toPincode: order.shippingZip,
    weightGrams,
    cod: order.financialStatus !== "paid",
  });
  return { serviceable: res.serviceable, options: res.options };
}

export async function shipOrder(
  shopDomain: string,
  input: ShipInput,
): Promise<ShipOutcome> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new Error("Order not found");

  const idempotencyKey = idempotencyKeyFor(input.orderId, input.courierKey);

  // §9.1 — short-circuit if this (order + courier) already shipped.
  const existing = await prisma.shipment.findUnique({ where: { idempotencyKey } });
  if (existing) return { shipment: existing, idempotent: true };

  const pickup = await getDefaultPickupAddress(shopDomain);
  if (!pickup) throw new Error("Set a pickup address in Logistics Config first.");

  const delivery = deliveryAddressFromOrder(order);
  const adapter = await getAdapterForShop(shopDomain, input.courierKey);

  // Serviceability gate (Phase 2 flow: serviceability → createShipment).
  const svc = await adapter.checkServiceability({
    fromPincode: pickup.pincode,
    toPincode: delivery.pincode,
    weightGrams: input.weightGrams,
    cod: input.cod,
    declaredValue: order.totalPrice,
  });
  if (!svc.serviceable) {
    throw new Error(`Destination ${delivery.pincode} is not serviceable by ${input.courierKey}.`);
  }
  const courierId = input.courierId ?? svc.options[0]?.courierId;

  const result = await adapter.createShipment({
    orderName: order.name,
    reference: order.id,
    pickup: toAdapterAddress(pickup),
    delivery,
    parcel: {
      weightGrams: input.weightGrams,
      lengthCm: input.lengthCm,
      widthCm: input.widthCm,
      heightCm: input.heightCm,
    },
    cod: input.cod,
    codAmount: input.codAmount,
    declaredValue: order.totalPrice,
    items: [
      { name: `Order ${order.name}`, quantity: order.lineItemsCount || 1, price: order.totalPrice },
    ],
    serviceType: input.serviceType,
    courierId,
  });

  // Persist. The unique constraints on idempotencyKey + awb are the last line of defense
  // against a duplicate AWB under a race (§9.1).
  try {
    const shipment = await prisma.shipment.create({
      data: {
        shopId: order.shopId,
        orderId: order.id,
        courierKey: input.courierKey,
        awb: result.awb,
        idempotencyKey,
        status: result.status,
        rawStatus: result.rawStatus,
        shippingCost: result.cost,
        codAmount: input.cod ? input.codAmount : null,
        currency: order.currency,
        weightGrams: input.weightGrams,
        shippedAt: new Date(),
      },
    });

    // §9.2 — meter the billable shipment (idempotent per shipment).
    await recordShipmentUsage(order.shopId, shipment.id);

    return { shipment, idempotent: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const shipment = await prisma.shipment.findUnique({ where: { idempotencyKey } });
      if (shipment) return { shipment, idempotent: true };
    }
    throw err;
  }
}
