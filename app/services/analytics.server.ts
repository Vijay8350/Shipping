import { ShipmentStatus } from "@prisma/client";

import prisma from "../db.server";

/**
 * Analytics aggregates for the dashboard (CLAUDE.md §1 — "Dashboard & analytics"). Plain
 * Prisma aggregation; the route gates premium widgets by plan.
 */
export interface Bucket {
  label: string;
  value: number;
}

export interface Analytics {
  kpis: {
    orders: number;
    shipments: number;
    delivered: number;
    inTransit: number;
    ndr: number;
    rto: number;
    pendingReturns: number;
    deliveredRatePct: number;
  };
  statusBreakdown: Bucket[];
  courierBreakdown: Bucket[];
  paymentBreakdown: Bucket[];
  codVsPrepaid: Bucket[];
  returnsBreakdown: Bucket[];
  ordersByDay: Bucket[];
}

export async function getAnalytics(shopDomain: string): Promise<Analytics> {
  const shopRow = await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { id: true } });
  const shopId = shopRow?.id ?? "__none__";

  const [orders, shipments, delivered, inTransit, ndr, rto, pendingReturns] = await prisma.$transaction([
    prisma.order.count({ where: { shopId } }),
    prisma.shipment.count({ where: { shopId } }),
    prisma.shipment.count({ where: { shopId, status: ShipmentStatus.DELIVERED } }),
    prisma.shipment.count({
      where: { shopId, status: { in: [ShipmentStatus.SHIPPED, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY] } },
    }),
    prisma.shipment.count({ where: { shopId, status: ShipmentStatus.NDR } }),
    prisma.shipment.count({
      where: { shopId, status: { in: [ShipmentStatus.RTO_INITIATED, ShipmentStatus.RTO_DELIVERED] } },
    }),
    prisma.return.count({ where: { shopId, status: "PENDING" } }),
  ]);

  const [byStatus, byCourier, byPayment, codCount, returnsByStatus] = await Promise.all([
    prisma.shipment.groupBy({ by: ["status"], where: { shopId }, _count: true, orderBy: { status: "asc" } }),
    prisma.shipment.groupBy({ by: ["courierKey"], where: { shopId }, _count: true, orderBy: { courierKey: "asc" } }),
    prisma.order.groupBy({ by: ["financialStatus"], where: { shopId }, _count: true, orderBy: { financialStatus: "asc" } }),
    prisma.shipment.count({ where: { shopId, codAmount: { not: null } } }),
    prisma.return.groupBy({ by: ["status"], where: { shopId }, _count: true, orderBy: { status: "asc" } }),
  ]);

  // Orders per day for the last 14 days (bucketed in JS — portable across DBs).
  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);
  const recent = await prisma.order.findMany({
    where: { shopId, shopifyCreatedAt: { gte: since } },
    select: { shopifyCreatedAt: true },
  });
  const dayCounts = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    dayCounts.set(d.toISOString().slice(5, 10), 0);
  }
  for (const o of recent) {
    if (!o.shopifyCreatedAt) continue;
    const key = o.shopifyCreatedAt.toISOString().slice(5, 10);
    if (dayCounts.has(key)) dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }

  return {
    kpis: {
      orders,
      shipments,
      delivered,
      inTransit,
      ndr,
      rto,
      pendingReturns,
      deliveredRatePct: shipments ? Math.round((delivered / shipments) * 100) : 0,
    },
    statusBreakdown: byStatus.map((r) => ({ label: r.status, value: r._count })),
    courierBreakdown: byCourier.map((r) => ({ label: r.courierKey, value: r._count })),
    paymentBreakdown: byPayment.map((r) => ({ label: r.financialStatus ?? "unknown", value: r._count })),
    codVsPrepaid: [
      { label: "COD", value: codCount },
      { label: "Prepaid", value: Math.max(0, shipments - codCount) },
    ],
    returnsBreakdown: returnsByStatus.map((r) => ({ label: r.status, value: r._count })),
    ordersByDay: Array.from(dayCounts.entries()).map(([label, value]) => ({ label, value })),
  };
}
