import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import { requireShop } from "../session.server";
import { AppShell } from "../components/AppShell";
import { getAnalytics, type Bucket } from "../services/analytics.server";
import { getShopPlan } from "../services/billing.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await requireShop(request);
  const [analytics, plan] = await Promise.all([getAnalytics(shop), getShopPlan(shop)]);
  return json({ shop, analytics, premium: plan.features.premiumAnalytics, planName: plan.name });
}

const C = {
  ink: "#1a1a2e",
  body: "#5a5e73",
  muted: "#9aa0ad",
  border: "#e7e9ef",
  surface: "#fff",
  brand: "#3b4fe4",
};
const CARD: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: 20,
  boxShadow: "0 1px 2px rgba(16,24,40,.04)",
};
const TINT: Record<string, { bg: string; fg: string }> = {
  gray: { bg: "#eef1f4", fg: "#475569" },
  indigo: { bg: "#eef0fe", fg: "#3b4fe4" },
  green: { bg: "#e4f6ec", fg: "#1b7f4b" },
  amber: { bg: "#fff4e0", fg: "#b7791f" },
  red: { bg: "#fde7e9", fg: "#c32b3b" },
};

function Icon({ d, color }: { d: string; color: string }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <path d={d} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Kpi({
  label,
  value,
  suffix,
  tint,
  iconPath,
  to,
}: {
  label: string;
  value: number;
  suffix?: string;
  tint: keyof typeof TINT;
  iconPath: string;
  to: string;
}) {
  const t = TINT[tint];
  return (
    <Link to={to} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.body }}>{label}</div>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: t.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon d={iconPath} color={t.fg} />
          </div>
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
          {value}
          {suffix ?? ""}
        </div>
      </div>
    </Link>
  );
}

function BarCard({
  title,
  data,
  locked,
}: {
  title: string;
  data: Bucket[];
  locked?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={CARD}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{title}</div>
      {locked ? (
        <div>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 8 }}>🔒 Premium analytics</div>
          <Link to="/billing" style={{ color: C.brand, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
            Upgrade to unlock
          </Link>
        </div>
      ) : data.length === 0 ? (
        <div style={{ fontSize: 13, color: C.muted }}>No data yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.map((d) => (
            <div key={d.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.body, marginBottom: 5 }}>
                <span style={{ fontWeight: 600 }}>{d.label}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{d.value}</span>
              </div>
              <div style={{ height: 8, background: "#f0f1f4", borderRadius: 999 }}>
                <div style={{ width: `${(d.value / max) * 100}%`, height: 8, background: C.brand, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ICONS = {
  orders: "M5 7h14M5 12h14M5 17h9",
  transit: "M3 17h2l1-2h8l1 2h2v-4l-2-5H7L3 13v4Z",
  delivered: "M20 6 9 17l-5-5",
  rate: "M4 19V5m0 14h16M8 16l3-4 3 2 4-6",
  ndr: "M12 9v4m0 4h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0Z",
  rto: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 5 5v3",
  returns: "M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8",
  shipments: "M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7",
};

export default function Dashboard() {
  const { shop, analytics, premium, planName } = useLoaderData<typeof loader>();
  const k = analytics.kpis;

  return (
    <AppShell shop={shop}>
      <div style={{ padding: "26px 30px 60px", maxWidth: 1320, fontFamily: "'Plus Jakarta Sans',sans-serif", color: C.ink }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 5 }}>{shop} · {planName} plan</div>
            <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-.02em" }}>Dashboard</div>
          </div>
          <Link
            to="/orders"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: C.brand,
              color: "#fff",
              borderRadius: 9,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 2px 6px rgba(59,79,228,.28)",
            }}
          >
            Ship orders →
          </Link>
        </div>

        {/* KPI grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 16 }}>
          <Kpi label="Orders" value={k.orders} tint="gray" iconPath={ICONS.orders} to="/orders" />
          <Kpi label="In transit" value={k.inTransit} tint="indigo" iconPath={ICONS.transit} to="/tracking" />
          <Kpi label="Delivered" value={k.delivered} tint="green" iconPath={ICONS.delivered} to="/tracking" />
          <Kpi label="Delivered rate" value={k.deliveredRatePct} suffix="%" tint="green" iconPath={ICONS.rate} to="/tracking" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 22 }}>
          <Kpi label="NDR — needs action" value={k.ndr} tint="amber" iconPath={ICONS.ndr} to="/ndr" />
          <Kpi label="RTO" value={k.rto} tint="red" iconPath={ICONS.rto} to="/rto" />
          <Kpi label="Pending returns" value={k.pendingReturns} tint="amber" iconPath={ICONS.returns} to="/returns" />
          <Kpi label="Shipments" value={k.shipments} tint="gray" iconPath={ICONS.shipments} to="/tracking" />
        </div>

        {/* Charts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
          <BarCard title="Shipment status" data={analytics.statusBreakdown} />
          <BarCard title="COD vs Prepaid" data={analytics.codVsPrepaid} />
          <BarCard title="Payment status" data={analytics.paymentBreakdown} />
          <BarCard title="Returns" data={analytics.returnsBreakdown} />
          <BarCard title="Orders (last 14 days)" data={analytics.ordersByDay} locked={!premium} />
          <BarCard title="Courier-wise shipments" data={analytics.courierBreakdown} locked={!premium} />
        </div>
      </div>
    </AppShell>
  );
}
