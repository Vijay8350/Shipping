import type { LoaderFunctionArgs } from "@remix-run/node";

import prisma from "../db.server";
import { requireShop } from "../session.server";
import { getCourierMeta } from "../lib/carriers/registry";
import { ShipmentStatus } from "@prisma/client";
import { generateManifestPdf } from "../services/pdf.server";

/**
 * Manifest PDF (Phase 2 item 6) — the not-yet-handed-over shipments (READY_TO_SHIP),
 * for handing to the courier at pickup. Available at /manifest.pdf.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);

  const shipments = await prisma.shipment.findMany({
    where: { shop: { shop }, status: ShipmentStatus.READY_TO_SHIP },
    include: { order: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const pdf = await generateManifestPdf({
    shop,
    dateLabel: new Date().toISOString().slice(0, 10),
    rows: shipments.map((s) => ({
      awb: s.awb,
      courierName: getCourierMeta(s.courierKey)?.displayName ?? s.courierKey,
      orderName: s.order.name,
      destination: [s.order.shippingCity, s.order.shippingProvince]
        .filter(Boolean)
        .join(", "),
    })),
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="manifest.pdf"`,
    },
  });
}
