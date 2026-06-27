import prisma from "../db.server";
import type { Address } from "../lib/carriers/types";

/** Pickup address (shipment origin) management — set in Logistics Config. */

async function getShopId(shopDomain: string): Promise<string> {
  const shop = await prisma.shop.findUnique({
    where: { shop: shopDomain },
    select: { id: true },
  });
  if (!shop) throw new Error(`No Shop row for ${shopDomain}`);
  return shop.id;
}

export async function listPickupAddresses(shopDomain: string) {
  const shopId = await getShopId(shopDomain);
  return prisma.pickupAddress.findMany({
    where: { shopId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

export async function getDefaultPickupAddress(shopDomain: string) {
  const shopId = await getShopId(shopDomain);
  return (
    (await prisma.pickupAddress.findFirst({ where: { shopId, isDefault: true } })) ??
    (await prisma.pickupAddress.findFirst({ where: { shopId }, orderBy: { createdAt: "asc" } }))
  );
}

export async function createPickupAddress(
  shopDomain: string,
  input: {
    label: string;
    contactName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    isDefault?: boolean;
  },
) {
  const shopId = await getShopId(shopDomain);
  const existing = await prisma.pickupAddress.count({ where: { shopId } });
  const makeDefault = input.isDefault || existing === 0;

  return prisma.$transaction(async (tx) => {
    if (makeDefault) {
      await tx.pickupAddress.updateMany({ where: { shopId }, data: { isDefault: false } });
    }
    return tx.pickupAddress.create({
      data: { shopId, ...input, isDefault: makeDefault },
    });
  });
}

/** Convert a stored PickupAddress row into the adapter Address shape. */
export function toAdapterAddress(row: {
  label: string;
  contactName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
}): Address {
  return {
    name: row.contactName || row.label,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2 ?? undefined,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    country: row.country,
  };
}
