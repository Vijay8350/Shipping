import { useState } from "react";
import { Form, Link, useLocation } from "@remix-run/react";
import { AppProvider, Text } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

import { NAVIGATION } from "../lib/navigation";

/**
 * Custom app shell matching the "JSY Logistics" design prototype (NOT Polaris Frame):
 * full-width top bar (logo + search + shop) and a left sidebar with sectioned nav,
 * indigo active state, and badges. Still wrapped in Polaris AppProvider so page bodies
 * that use Polaris components keep working. Standalone on our domain (CLAUDE.md §2).
 */

const C = {
  brand: "#3b4fe4",
  brandDark: "#1d63d1",
  ink: "#1a1a2e",
  body: "#5a5e73",
  muted: "#9aa0ad",
  iconIdle: "#7a8094",
  border: "#e7e9ef",
  border2: "#e2e5ec",
  bg: "#f0f1f4",
  surface: "#ffffff",
  navActiveBg: "#eef0fe",
  green: "#1b7f4b",
  greenBg: "#e4f6ec",
  greenDot: "#22a65c",
};

const FONT =
  "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

/** Minimal inline icon set keyed by nav label (falls back to a dot). */
function NavIcon({ label, color }: { label: string; color: string }) {
  const p = (d: string) => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <path d={d} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const l = label.toLowerCase();
  if (l.includes("dashboard")) return p("M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7V11h-7v9Zm0-16v5h7V4h-7Z");
  if (l.includes("order")) return p("M5 7h14M5 12h14M5 17h9");
  if (l.includes("shipping") || l.includes("awb")) return p("M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7");
  if (l.includes("tracking")) return p("M3 17h2l1-2h8l1 2h2v-4l-2-5H7L3 13v4Zm3 0a2 2 0 1 0 4 0m4 0a2 2 0 1 0 4 0");
  if (l.includes("pickup")) return p("M12 3v12m0 0 4-4m-4 4-4-4M5 21h14");
  if (l.includes("automation")) return p("M13 2 4 14h6l-1 8 9-12h-6l1-8Z");
  if (l.includes("ndr")) return p("M12 9v4m0 4h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0Z");
  if (l.includes("rto")) return p("M9 14 4 9l5-5M4 9h11a5 5 0 0 1 5 5v3");
  if (l.includes("return")) return p("M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8");
  if (l.includes("edd") || l.includes("delivery")) return p("M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z");
  if (l.includes("logistics")) return p("M9 2v6M15 2v6M5 8h14l-1 12H6L5 8Z");
  if (l.includes("notification")) return p("M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4");
  if (l.includes("billing") || l.includes("plan")) return p("M3 7h18v10H3V7Zm0 4h18");
  if (l.includes("settings")) return p("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.2-1.8l2-1.5-2-3.4-2.3 1a8 8 0 0 0-3-1.8L14 2h-4l-.5 2.7a8 8 0 0 0-3 1.8l-2.3-1-2 3.4 2 1.5A8 8 0 0 0 4 12c0 .6 0 1.2.2 1.8l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 3 1.8L10 22h4l.5-2.7a8 8 0 0 0 3-1.8l2.3 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8Z");
  return p("M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0");
}

export function AppShell({ shop, children }: { shop: string; children: React.ReactNode }) {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  const sidebar = (
    <aside
      style={{
        flexShrink: 0,
        width: 248,
        background: C.surface,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <nav style={{ flex: 1, overflowY: "auto", padding: "14px 0 8px" }}>
        {NAVIGATION.map((section, si) => (
          <div key={section.title ?? si} style={{ marginBottom: 6 }}>
            {section.title ? (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  color: C.muted,
                  padding: "10px 24px 4px",
                }}
              >
                {section.title}
              </div>
            ) : null}
            {section.items.map((item) => {
              const active = location.pathname === item.url;
              const disabled = item.url === "#";
              const color = active ? C.brand : disabled ? "#bfc4d0" : C.iconIdle;
              const content = (
                <>
                  <span style={{ width: 19, height: 19, flexShrink: 0, display: "flex", color }}>
                    <NavIcon label={item.label} color={color} />
                  </span>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: active ? 700 : 600,
                      flex: 1,
                      whiteSpace: "nowrap",
                      color: active ? C.brand : disabled ? "#bfc4d0" : C.body,
                    }}
                  >
                    {item.label}
                  </span>
                </>
              );
              const rowStyle: React.CSSProperties = {
                display: "flex",
                alignItems: "center",
                gap: 12,
                textDecoration: "none",
                margin: "1px 12px",
                padding: "9px 12px",
                borderRadius: 9,
                background: active ? C.navActiveBg : "transparent",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.7 : 1,
              };
              return disabled ? (
                <div key={item.label} style={rowStyle} title="Coming soon">
                  {content}
                </div>
              ) : (
                <Link key={item.label} to={item.url} style={rowStyle}>
                  {content}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );

  return (
    <AppProvider i18n={enTranslations}>
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.ink }}>
        {/* Top bar */}
        <header
          style={{
            height: 60,
            background: C.surface,
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "0 18px",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <Link to="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: C.brand,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="m3 7.5 9 4.5 9-4.5M12 12v9" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.02em", color: C.ink }}>
              JSY Logistics
            </span>
          </Link>

          {/* Search → Orders */}
          <Form method="get" action="/orders" style={{ flex: 1, maxWidth: 420, margin: "0 8px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                border: `1px solid ${C.border2}`,
                background: "#f7f8fa",
                borderRadius: 9,
                padding: "0 13px",
                height: 38,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke={C.muted} strokeWidth="1.8" />
                <path d="m20 20-3.2-3.2" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                name="q"
                placeholder="Search order #, AWB or customer…"
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontFamily: "inherit",
                  fontSize: 13.5,
                  width: "100%",
                  color: C.ink,
                }}
              />
            </div>
          </Form>

          <div style={{ flex: 1 }} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              background: C.greenBg,
              color: C.green,
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 11px",
              borderRadius: 8,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.greenDot }} />
            {shop}
          </div>

          <Link
            to="/logout"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: C.body,
              textDecoration: "none",
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${C.border2}`,
            }}
          >
            Log out
          </Link>
        </header>

        {/* Body: sidebar + content */}
        <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 60px)" }}>
          {sidebar}
          <main style={{ flex: 1, minWidth: 0, overflowX: "hidden" }}>{children}</main>
        </div>
      </div>
    </AppProvider>
  );
}

/** Minimal Polaris provider for unauthenticated pages (e.g. the login screen). */
export function PolarisOnly({ children }: { children: React.ReactNode }) {
  return <AppProvider i18n={enTranslations}>{children}</AppProvider>;
}

export { Text };
