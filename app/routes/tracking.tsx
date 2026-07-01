import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { Prisma, ShipmentStatus } from "@prisma/client";

import prisma from "../db.server";
import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";

const STATUS_VALUES = Object.values(ShipmentStatus);

const C = { ink: "#1a1a2e", body: "#5a5e73", muted: "#9aa0ad", border: "#e7e9ef", brand: "#3b4fe4" };

function pill(s: string) {
  const green = { bg: "#e4f6ec", fg: "#1b7f4b", dot: "#22a65c" };
  const blue = { bg: "#e6f0ff", fg: "#1d63d1", dot: "#2e7cf6" };
  const indigo = { bg: "#eef0fe", fg: "#3b4fe4", dot: "#3b4fe4" };
  const amber = { bg: "#fff4e0", fg: "#b7791f", dot: "#f0a726" };
  const red = { bg: "#fde7e9", fg: "#c32b3b", dot: "#e5484d" };
  const gray = { bg: "#eef1f4", fg: "#5a5e73", dot: "#9aa0ad" };
  let c = gray;
  if (/DELIVERED|RETURN_RECEIVED/.test(s) && !/RTO/.test(s)) c = green;
  else if (/IN_TRANSIT|SHIPPED|OUT_FOR_DELIVERY/.test(s)) c = blue;
  else if (/READY_TO_SHIP/.test(s)) c = indigo;
  else if (/NDR/.test(s)) c = amber;
  else if (/RTO|CANCELLED|RETURN_INITIATED/.test(s)) c = red;
  return { ...c, label: s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const courier = url.searchParams.get("courier") ?? "";

  const where: Prisma.ShipmentWhereInput = { shop: { shop } };
  if (status && STATUS_VALUES.includes(status as ShipmentStatus)) where.status = status as ShipmentStatus;
  if (courier) where.courierKey = courier;

  const [shipments, couriers] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        order: { select: { id: true, name: true } },
        trackingEvents: { orderBy: { occurredAt: "desc" }, take: 25 },
      },
    }),
    prisma.shipment.findMany({ where: { shop: { shop } }, distinct: ["courierKey"], select: { courierKey: true } }),
  ]);

  return json({
    shop,
    status,
    courier,
    courierOptions: couriers.map((c) => c.courierKey),
    shipments: shipments.map((s) => ({
      id: s.id,
      awb: s.awb,
      courierKey: s.courierKey,
      status: s.status,
      orderId: s.order.id,
      orderName: s.order.name,
      lastTrackedAt: s.lastTrackedAt ? s.lastTrackedAt.toISOString().slice(0, 16).replace("T", " ") : null,
      events: s.trackingEvents.map((e) => ({
        id: e.id,
        status: e.status,
        rawStatus: e.rawStatus,
        location: e.location,
        message: e.message,
        occurredAt: e.occurredAt.toISOString().slice(0, 16).replace("T", " "),
      })),
    })),
  });
}

const selStyle: React.CSSProperties = {
  border: "1px solid #d7dbe3",
  background: "#fff",
  borderRadius: 9,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "#5a5e73",
  fontFamily: "inherit",
};

export default function TrackingPage() {
  const { shop, shipments, status, courier, courierOptions } = useLoaderData<typeof loader>();

  return (
    <AppShell shop={shop}>
      <div style={{ padding: "26px 30px 60px", maxWidth: 1120, fontFamily: "'Plus Jakarta Sans',sans-serif", color: C.ink }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-.02em" }}>Order Tracking</div>
          <div style={{ fontSize: 13, color: C.muted, fontWeight: 500, marginTop: 4 }}>
            Live shipment status and event timeline
          </div>
        </div>

        {/* filters */}
        <Form method="get" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <select name="status" aria-label="Filter by status" defaultValue={status} style={selStyle}>
            <option value="">All statuses</option>
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>{pill(s).label}</option>
            ))}
          </select>
          <select name="courier" aria-label="Filter by courier" defaultValue={courier} style={selStyle}>
            <option value="">All couriers</option>
            {courierOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button type="submit" style={{ ...selStyle, background: C.brand, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>
            Filter
          </button>
        </Form>

        {shipments.length === 0 ? (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: 48, textAlign: "center", color: C.muted }}>
            No shipments to track yet. Ship an order to see it here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {shipments.map((s) => {
              const st = pill(s.status);
              return (
                <div key={s.id} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Link to={`/orders/${s.orderId}`} style={{ fontSize: 14, fontWeight: 700, color: C.ink, textDecoration: "none" }}>
                        {s.orderName}
                      </Link>
                      <span style={{ fontSize: 12.5, color: "#8a8f9e", textTransform: "capitalize" }}>{s.courierKey}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: "#8a8f9e" }}>{s.awb}</span>
                    </div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: st.bg, color: st.fg, fontSize: 12, fontWeight: 600 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
                      {st.label}
                    </span>
                  </div>

                  {s.events.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: C.muted }}>
                      No tracking updates yet{s.lastTrackedAt ? ` · last polled ${s.lastTrackedAt}` : ""}.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0, borderLeft: "2px solid #eef0f3", paddingLeft: 16, marginLeft: 4 }}>
                      {s.events.map((e, i) => {
                        const es = pill(e.status);
                        return (
                          <div key={e.id} style={{ position: "relative", paddingBottom: i === s.events.length - 1 ? 0 : 14 }}>
                            <span style={{ position: "absolute", left: -23, top: 3, width: 9, height: 9, borderRadius: "50%", background: es.dot, border: "2px solid #fff", boxShadow: "0 0 0 2px #eef0f3" }} />
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                              {e.message || e.rawStatus || es.label}
                            </div>
                            <div style={{ fontSize: 11.5, color: C.muted }}>
                              {[e.occurredAt, e.location].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
