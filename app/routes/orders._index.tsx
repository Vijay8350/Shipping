import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import type { Prisma } from "@prisma/client";

import prisma from "../db.server";
import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { shipOrder } from "../services/shipping.server";

const PAGE_SIZE = 20;

const TABS = [
  { id: "all", label: "All" },
  { id: "unfulfilled", label: "Unfulfilled" },
  { id: "partial", label: "Partial" },
  { id: "fulfilled", label: "Fulfilled" },
];

function tabWhere(tab: string): Prisma.OrderWhereInput {
  if (tab === "unfulfilled")
    return { OR: [{ fulfillmentStatus: "unfulfilled" }, { fulfillmentStatus: null }] };
  if (tab === "fulfilled") return { fulfillmentStatus: "fulfilled" };
  if (tab === "partial") return { fulfillmentStatus: { in: ["partial", "partially_fulfilled"] } };
  return {};
}

export async function loader({ request }: LoaderFunctionArgs) {
  const shopDomain = await requireShop(request);
  const shopRow = await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { id: true } });
  const shopId = shopRow?.id ?? "__none__";

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const and: Prisma.OrderWhereInput[] = [tabWhere(tab)];
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.OrderWhereInput = { shopId, AND: and };

  const [orders, total, cAll, cUnf, cPar, cFul, couriers, pickupCount] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { shopifyCreatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { shipments: { take: 1, orderBy: { createdAt: "desc" }, select: { courierKey: true, awb: true, status: true } } },
    }),
    prisma.order.count({ where }),
    prisma.order.count({ where: { shopId } }),
    prisma.order.count({ where: { shopId, ...tabWhere("unfulfilled") } }),
    prisma.order.count({ where: { shopId, ...tabWhere("partial") } }),
    prisma.order.count({ where: { shopId, ...tabWhere("fulfilled") } }),
    prisma.courierAccount.findMany({ where: { shopId, enabled: true }, select: { courierKey: true } }),
    prisma.pickupAddress.count({ where: { shopId } }),
  ]);

  return json({
    shop: shopDomain,
    tab,
    q,
    page,
    total,
    pageSize: PAGE_SIZE,
    counts: { all: cAll, unfulfilled: cUnf, partial: cPar, fulfilled: cFul } as Record<string, number>,
    couriers: couriers.map((c) => c.courierKey),
    hasPickup: pickupCount > 0,
    orders: orders.map((o) => ({
      id: o.id,
      name: o.name,
      customer: o.customerName || o.email || "—",
      destination: [o.shippingCity, o.shippingProvince].filter(Boolean).join(", "),
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      totalPrice: o.totalPrice,
      currency: o.currency,
      lineItemsCount: o.lineItemsCount,
      courier: o.shipments[0]?.courierKey ?? null,
      awb: o.shipments[0]?.awb ?? null,
      shipmentId: null as string | null,
      shipmentStatus: o.shipments[0]?.status ?? null,
      shipped: o.shipments.length > 0,
      createdAt: o.shopifyCreatedAt
        ? o.shopifyCreatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
        : "",
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const shop = await requireShop(request);
  const form = await request.formData();
  const courierKey = String(form.get("courierKey") || "");
  const ids = form.getAll("orderId").map(String).filter(Boolean);

  if (!courierKey) return json({ shipped: 0, failed: 0, errors: [], error: "Select a courier first." });
  if (ids.length === 0) return json({ shipped: 0, failed: 0, errors: [], error: "Select at least one order." });

  const orders = await prisma.order.findMany({
    where: { id: { in: ids }, shop: { shop } },
    select: { id: true, financialStatus: true, totalPrice: true },
  });

  let shipped = 0;
  const errors: string[] = [];
  for (const o of orders) {
    const cod = o.financialStatus !== "paid";
    try {
      await shipOrder(shop, { orderId: o.id, courierKey, weightGrams: 500, cod, codAmount: cod ? o.totalPrice : undefined });
      shipped += 1;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return json({ shipped, failed: errors.length, errors: [...new Set(errors)].slice(0, 4), error: null });
}

const C = { ink: "#1a1a2e", body: "#5a5e73", muted: "#9aa0ad", border: "#e7e9ef", brand: "#3b4fe4" };

function amount(minor: number, currency: string) {
  const major = minor / 100;
  if (currency === "INR") return "₹" + major.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `${currency} ${major.toFixed(0)}`;
}
function paymentBadge(fin: string | null) {
  const m: Record<string, { bg: string; fg: string; label: string }> = {
    paid: { bg: "#eef0fe", fg: "#3b4fe4", label: "Prepaid" },
    pending: { bg: "#fff4e0", fg: "#b7791f", label: "Pending" },
    refunded: { bg: "#fde7e9", fg: "#c32b3b", label: "Refunded" },
  };
  return m[fin ?? ""] ?? { bg: "#eef1f4", fg: "#5a5e73", label: fin ?? "—" };
}
function statusBadge(shipment: string | null, fulfillment: string | null) {
  const s = (shipment ?? fulfillment ?? "unfulfilled").toString();
  const green = { bg: "#e4f6ec", fg: "#1b7f4b", dot: "#22a65c" };
  const blue = { bg: "#e6f0ff", fg: "#1d63d1", dot: "#2e7cf6" };
  const indigo = { bg: "#eef0fe", fg: "#3b4fe4", dot: "#3b4fe4" };
  const amber = { bg: "#fff4e0", fg: "#b7791f", dot: "#f0a726" };
  const red = { bg: "#fde7e9", fg: "#c32b3b", dot: "#e5484d" };
  const gray = { bg: "#eef1f4", fg: "#5a5e73", dot: "#9aa0ad" };
  const label = s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  let c = gray;
  if (/DELIVERED|fulfilled/i.test(s) && !/RTO/i.test(s)) c = green;
  else if (/IN_TRANSIT|SHIPPED|OUT_FOR_DELIVERY|transit/i.test(s)) c = blue;
  else if (/READY_TO_SHIP/i.test(s)) c = indigo;
  else if (/NDR|partial/i.test(s)) c = amber;
  else if (/RTO|CANCELLED|RETURN/i.test(s)) c = red;
  return { ...c, label };
}

const COLS = "34px 1.5fr 0.7fr 0.5fr 0.85fr 0.8fr 1.35fr 1.05fr 40px";

export default function OrdersPage() {
  const { shop, orders, tab, q, page, total, pageSize, counts, couriers, hasPickup } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const shipping = nav.state === "submitting";

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courierKey, setCourierKey] = useState(couriers[0] ?? "");

  const shippable = orders.filter((o) => !o.shipped).map((o) => o.id);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((prev) => (prev.size === shippable.length ? new Set() : new Set(shippable)));

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const qs = (o: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (o.tab && o.tab !== "all") p.set("tab", String(o.tab));
    if (o.q) p.set("q", String(o.q));
    if (o.page && Number(o.page) > 1) p.set("page", String(o.page));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <AppShell shop={shop}>
      <div style={{ padding: "26px 30px 60px", maxWidth: 1320, fontFamily: "'Plus Jakarta Sans',sans-serif", color: C.ink }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-.02em" }}>All Orders</div>
          <div style={{ fontSize: 13, color: C.muted, fontWeight: 500, marginTop: 4 }}>
            {total.toLocaleString("en-IN")} order{total === 1 ? "" : "s"} · {counts.unfulfilled} awaiting shipment
          </div>
        </div>

        {/* setup / result banners */}
        {(!hasPickup || couriers.length === 0) && (
          <div style={{ background: "#fff4e0", border: "1px solid #f3d9a5", color: "#8a5a12", borderRadius: 11, padding: "11px 16px", marginBottom: 14, fontSize: 13 }}>
            To ship orders, first {couriers.length === 0 ? "connect a courier" : ""}
            {couriers.length === 0 && !hasPickup ? " and " : ""}
            {!hasPickup ? "add a pickup address" : ""} in{" "}
            <Link to="/logistics" style={{ color: C.brand, fontWeight: 700 }}>Logistics Config</Link>.
          </div>
        )}
        {actionData?.error && (
          <div style={{ background: "#fde7e9", border: "1px solid #f3c7cd", color: "#c32b3b", borderRadius: 11, padding: "11px 16px", marginBottom: 14, fontSize: 13 }}>
            {actionData.error}
          </div>
        )}
        {actionData && actionData.error === null && (
          <div style={{ background: actionData.failed ? "#fff4e0" : "#e4f6ec", border: `1px solid ${actionData.failed ? "#f3d9a5" : "#c5ead4"}`, color: actionData.failed ? "#8a5a12" : "#1b7f4b", borderRadius: 11, padding: "11px 16px", marginBottom: 14, fontSize: 13 }}>
            ✓ Shipped {actionData.shipped} order{actionData.shipped === 1 ? "" : "s"}
            {actionData.failed ? ` · ${actionData.failed} failed: ${actionData.errors.join("; ")}` : ""}
          </div>
        )}

        {/* tabs */}
        <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 16, overflowX: "auto" }}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <Link key={t.id} to={`/orders${qs({ tab: t.id, q })}`} style={{ padding: "10px 14px", fontSize: 13, fontWeight: active ? 700 : 600, color: active ? C.brand : C.body, borderBottom: active ? `2px solid ${C.brand}` : "2px solid transparent", marginBottom: -1, whiteSpace: "nowrap", textDecoration: "none" }}>
                {t.label} <span style={{ color: "#b5b9c4", fontWeight: 600 }}>{counts[t.id] ?? 0}</span>
              </Link>
            );
          })}
        </div>

        {/* search */}
        <Form method="get" action="/orders" style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <input type="hidden" name="tab" value={tab} />
          <div style={{ flex: 1, maxWidth: 360, display: "flex", alignItems: "center", gap: 9, border: "1px solid #e2e5ec", background: "#fff", borderRadius: 9, padding: "0 12px", height: 40 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke={C.muted} strokeWidth="1.8" /><path d="m20 20-3.2-3.2" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" /></svg>
            <input name="q" defaultValue={q} placeholder="Search order #, AWB or customer" style={{ border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13.5, width: "100%", color: C.ink }} />
          </div>
        </Form>

        {/* bulk action bar */}
        {selected.size > 0 && (
          <Form method="post" style={{ display: "flex", alignItems: "center", gap: 12, background: "#eef0fe", border: "1px solid #d9defe", borderRadius: 11, padding: "10px 16px", marginBottom: 14, flexWrap: "wrap" }}>
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="orderId" value={id} />
            ))}
            <span style={{ fontSize: 13, fontWeight: 700, color: C.brand }}>{selected.size} selected</span>
            <span style={{ width: 1, height: 18, background: "#c7cdfa" }} />
            <select
              name="courierKey"
              aria-label="Courier"
              value={courierKey}
              onChange={(e) => setCourierKey(e.target.value)}
              style={{ border: "1px solid #c7cdfa", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, color: C.ink, fontFamily: "inherit", background: "#fff", textTransform: "capitalize" }}
            >
              {couriers.length === 0 ? <option value="">No courier connected</option> : couriers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="submit" disabled={shipping || couriers.length === 0 || !hasPickup} style={{ border: "none", background: C.brand, color: "#fff", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer", opacity: shipping || couriers.length === 0 || !hasPickup ? 0.5 : 1 }}>
              {shipping ? "Shipping…" : "Assign courier & ship"}
            </button>
            <a href="/manifest.pdf" style={{ border: "1px solid #c7cdfa", background: "#fff", color: C.brand, fontSize: 12.5, fontWeight: 600, padding: "8px 13px", borderRadius: 8, textDecoration: "none" }}>Download manifest</a>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => setSelected(new Set())} style={{ border: "none", background: "transparent", color: C.body, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Clear</button>
          </Form>
        )}

        {/* table */}
        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, alignItems: "center", padding: "12px 18px", background: "#fafbfc", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted }}>
            <input type="checkbox" aria-label="Select all shippable" checked={shippable.length > 0 && selected.size === shippable.length} onChange={toggleAll} />
            <div>Order</div><div>Date</div><div>Items</div><div>Payment</div><div>Amount</div><div>Courier / AWB</div><div>Status</div><div />
          </div>

          {orders.length === 0 ? (
            <div style={{ padding: "48px 18px", textAlign: "center", color: C.muted, fontSize: 14 }}>No orders yet. Orders sync automatically from Shopify.</div>
          ) : (
            orders.map((o) => {
              const pay = paymentBadge(o.financialStatus);
              const st = statusBadge(o.shipmentStatus, o.fulfillmentStatus);
              return (
                <div key={o.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #f0f1f4", background: selected.has(o.id) ? "#fafbff" : "#fff" }}>
                  {o.shipped ? <span /> : <input type="checkbox" aria-label={`Select ${o.name}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />}
                  <div>
                    <Link to={`/orders/${o.id}`} style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, textDecoration: "none" }}>{o.name}</Link>
                    <div style={{ fontSize: 12, color: "#8a8f9e" }}>{o.customer}{o.destination ? ` · ${o.destination}` : ""}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.body, fontWeight: 500 }}>{o.createdAt}</div>
                  <div style={{ fontSize: 12.5, color: C.body, fontWeight: 600 }}>{o.lineItemsCount}</div>
                  <div><span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 6, background: pay.bg, color: pay.fg, fontSize: 11.5, fontWeight: 700 }}>{pay.label}</span></div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{amount(o.totalPrice, o.currency)}</div>
                  <div>
                    {o.courier ? (
                      <>
                        <div style={{ fontSize: 12.5, fontWeight: 600, textTransform: "capitalize" }}>{o.courier}</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#8a8f9e" }}>{o.awb}</div>
                      </>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "#b5b9c4" }}>Not shipped</span>
                    )}
                  </div>
                  <div><span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: st.bg, color: st.fg, fontSize: 12, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />{st.label}</span></div>
                  <Link to={`/orders/${o.id}`} style={{ textAlign: "right", color: C.muted, fontSize: 18, textDecoration: "none" }}>›</Link>
                </div>
              );
            })
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", fontSize: 13, color: C.body }}>
            <span>Page {page} of {lastPage}</span>
            <span style={{ display: "flex", gap: 8 }}>
              <PageLink disabled={page <= 1} to={`/orders${qs({ tab, q, page: page - 1 })}`}>← Prev</PageLink>
              <PageLink disabled={page >= lastPage} to={`/orders${qs({ tab, q, page: page + 1 })}`}>Next →</PageLink>
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function PageLink({ disabled, to, children }: { disabled: boolean; to: string; children: React.ReactNode }) {
  return (
    <Link to={to} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid #d7dbe3", fontSize: 13, fontWeight: 600, textDecoration: "none", color: disabled ? "#c4c9d4" : "#5a5e73", background: "#fff", pointerEvents: disabled ? "none" : "auto" }}>
      {children}
    </Link>
  );
}
