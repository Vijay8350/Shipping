import prisma from "../db.server";
import { getAdapterForShop } from "./courier-accounts.server";
import { getDefaultPickupAddress, toAdapterAddress } from "./pickup-addresses.server";

/**
 * Pickup scheduling (CLAUDE.md §7, BUILD-PHASES Phase 3 item 4). Warehouse-level pickup
 * (Delhivery) works from this screen; Shiprocket schedules pickups per shipment, so a
 * shipmentId can be supplied to target one. Records a PickupRequest with its status.
 */

async function getShopId(shopDomain: string): Promise<string> {
  const shop = await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { id: true } });
  if (!shop) throw new Error(`No Shop row for ${shopDomain}`);
  return shop.id;
}

export async function listPickupRequests(shopDomain: string) {
  const shopId = await getShopId(shopDomain);
  return prisma.pickupRequest.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function schedulePickup(
  shopDomain: string,
  input: {
    courierKey: string;
    pickupDate: string;
    packageCount?: number;
    shipmentId?: string;
  },
) {
  const shopId = await getShopId(shopDomain);
  const pickup = await getDefaultPickupAddress(shopDomain);
  if (!pickup) throw new Error("Set a pickup address in Logistics Config first.");

  let externalShipmentId: string | undefined;
  if (input.shipmentId) {
    const s = await prisma.shipment.findUnique({ where: { id: input.shipmentId } });
    externalShipmentId = s?.externalShipmentId ?? undefined;
  }

  const adapter = await getAdapterForShop(shopDomain, input.courierKey);

  try {
    const result = await adapter.schedulePickup({
      address: toAdapterAddress(pickup),
      pickupDate: input.pickupDate,
      externalShipmentId,
    });
    return prisma.pickupRequest.create({
      data: {
        shopId,
        courierKey: input.courierKey,
        externalPickupId: result.pickupId ?? null,
        status: "scheduled",
        scheduledFor: result.scheduledFor ? new Date(result.scheduledFor) : new Date(input.pickupDate),
        packageCount: input.packageCount ?? 1,
        raw: result.raw as object,
      },
    });
  } catch (err) {
    // Record the failed attempt so the merchant sees status (e.g. Shiprocket needs a shipment).
    await prisma.pickupRequest.create({
      data: {
        shopId,
        courierKey: input.courierKey,
        status: "failed",
        scheduledFor: new Date(input.pickupDate),
        packageCount: input.packageCount ?? 1,
        raw: { error: (err as Error).message },
      },
    });
    throw err;
  }
}
