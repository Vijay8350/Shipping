import type { LoaderFunctionArgs } from "@remix-run/node";

import prisma from "../db.server";
import { requireShop } from "../session.server";
import { getCourierMeta } from "../lib/carriers/registry";
import { getDefaultPickupAddress } from "../services/pickup-addresses.server";
import { generateLabelPdf } from "../services/pdf.server";

/**
 * Serve the in-app generated label PDF for a shipment (Phase 2 item 6). Scoped to the
 * logged-in shop so one merchant can't fetch another's labels.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const shop = await requireShop(request);

  const shipment = await prisma.shipment.findFirst({
    where: { id: params.shipmentId, shop: { shop } },
    include: { order: true },
  });
  if (!shipment) throw new Response("Shipment not found", { status: 404 });

  const pickup = await getDefaultPickupAddress(shop);
  const order = shipment.order;

  const pdf = await generateLabelPdf({
    courierName: getCourierMeta(shipment.courierKey)?.displayName ?? shipment.courierKey,
    awb: shipment.awb,
    orderName: order.name,
    shipFrom: pickup
      ? {
          name: pickup.contactName,
          phone: pickup.phone,
          line1: pickup.line1,
          line2: pickup.line2,
          city: pickup.city,
          state: pickup.state,
          pincode: pickup.pincode,
        }
      : { name: shop, phone: "", line1: "", city: "", state: "", pincode: "" },
    shipTo: {
      name: order.shippingName || order.customerName || "Customer",
      phone: order.phone || "",
      line1: order.shippingAddress1 || "",
      line2: order.shippingAddress2,
      city: order.shippingCity || "",
      state: order.shippingProvince || "",
      pincode: order.shippingZip || "",
    },
    weightGrams: shipment.weightGrams ?? 0,
    cod: shipment.codAmount != null,
    codAmount: shipment.codAmount ?? undefined,
    currency: shipment.currency,
    items: [{ name: `Order ${order.name}`, quantity: order.lineItemsCount || 1 }],
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-${shipment.awb}.pdf"`,
    },
  });
}
