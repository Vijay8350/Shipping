import type { LoaderFunctionArgs } from "@remix-run/node";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getStorefrontConfig } from "../services/storefront-settings.server";
import { escapeHtml, htmlResponse, renderStorefrontPage } from "../lib/storefront-html";

/**
 * Branded tracking page served through the App Proxy (CLAUDE.md §10). appProxy() verifies
 * the proxy signature. Only shipments shipped THROUGH the app are shown.
 * Storefront URL: /apps/ils/track?awb=XXXX
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop") ?? "";
  const awb = (url.searchParams.get("awb") ?? "").trim();

  const config = await getStorefrontConfig(shopDomain);
  if (!config.trackingEnabled) {
    return htmlResponse(renderStorefrontPage(config, "Tracking", `<div class="card">Tracking is currently unavailable.</div>`), 404);
  }

  if (!awb) {
    return htmlResponse(
      renderStorefrontPage(
        config,
        "Track your order",
        `<div class="card">
           <form method="get">
             <label for="awb">Enter your tracking number (AWB)</label>
             <input id="awb" name="awb" value="" />
             <button type="submit">Track</button>
           </form>
         </div>`,
      ),
    );
  }

  const shipment = await prisma.shipment.findFirst({
    where: { awb, shop: { shop: shopDomain } },
    include: {
      order: { select: { name: true } },
      trackingEvents: { orderBy: { occurredAt: "desc" }, take: 30 },
    },
  });

  if (!shipment) {
    return htmlResponse(
      renderStorefrontPage(
        config,
        "Track your order",
        `<div class="card">We couldn't find a shipment for AWB <strong>${escapeHtml(awb)}</strong>.</div>`,
      ),
      404,
    );
  }

  const events = shipment.trackingEvents
    .map(
      (e) => `<li>
        <span class="badge">${escapeHtml(e.status)}</span>
        <div>${escapeHtml(e.message || e.rawStatus || "")}${e.location ? " · " + escapeHtml(e.location) : ""}</div>
        <div class="muted">${e.occurredAt.toISOString().slice(0, 16).replace("T", " ")}</div>
      </li>`,
    )
    .join("");

  const body = `
    <div class="card">
      <div class="muted">Order ${escapeHtml(shipment.order.name)}</div>
      <h1 style="margin:8px 0">${escapeHtml(shipment.courierKey)} · ${escapeHtml(shipment.awb)}</h1>
      <span class="badge">${escapeHtml(shipment.status)}</span>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Tracking history</h2>
      ${events ? `<ul class="timeline">${events}</ul>` : `<p class="muted">No tracking updates yet.</p>`}
    </div>
    ${config.supportEmail ? `<p class="muted">Questions? <a href="mailto:${escapeHtml(config.supportEmail)}">${escapeHtml(config.supportEmail)}</a></p>` : ""}`;

  return htmlResponse(renderStorefrontPage(config, "Track your order", body));
}
