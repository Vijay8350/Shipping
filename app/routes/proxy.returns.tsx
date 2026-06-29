import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { getStorefrontConfig } from "../services/storefront-settings.server";
import { createStorefrontReturn } from "../services/returns.server";
import { escapeHtml, htmlResponse, renderStorefrontPage } from "../lib/storefront-html";

/**
 * Self-service returns page served through the App Proxy (CLAUDE.md §10, Phase 5). The
 * customer submits order number + email; a PENDING return is created that feeds the
 * Phase 4 admin Return Requests flow. Storefront URL: /apps/ils/returns
 */
function shopFromRequest(request: Request): string {
  return new URL(request.url).searchParams.get("shop") ?? "";
}

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);
  const config = await getStorefrontConfig(shopFromRequest(request));
  if (!config.returnsEnabled) {
    return htmlResponse(renderStorefrontPage(config, "Returns", `<div class="card">Returns are currently unavailable.</div>`), 404);
  }
  return htmlResponse(renderStorefrontPage(config, "Start a return", returnForm()));
}

export async function action({ request }: ActionFunctionArgs) {
  await authenticate.public.appProxy(request);
  const shopDomain = shopFromRequest(request);
  const config = await getStorefrontConfig(shopDomain);
  const form = await request.formData();

  try {
    await createStorefrontReturn(shopDomain, {
      orderName: String(form.get("orderName") || ""),
      email: String(form.get("email") || ""),
      reason: String(form.get("reason") || "") || undefined,
      note: String(form.get("note") || "") || undefined,
    });
  } catch (err) {
    return htmlResponse(
      renderStorefrontPage(
        config,
        "Start a return",
        `<div class="card" style="border-color:#d72c0d"><strong>${escapeHtml((err as Error).message)}</strong></div>${returnForm()}`,
      ),
      400,
    );
  }

  return htmlResponse(
    renderStorefrontPage(
      config,
      "Return requested",
      `<div class="card">
         <span class="badge">Request received</span>
         <h1 style="margin:12px 0">Thanks — your return is pending review.</h1>
         <p class="muted">We'll email you once it's approved with the next steps.</p>
       </div>`,
    ),
  );
}

function returnForm(): string {
  return `<div class="card">
    <form method="post">
      <label for="orderName">Order number</label>
      <input id="orderName" name="orderName" placeholder="#1001" required />
      <label for="email">Email used on the order</label>
      <input id="email" name="email" type="email" required />
      <label for="reason">Reason</label>
      <select id="reason" name="reason">
        <option>Wrong item</option>
        <option>Damaged</option>
        <option>No longer needed</option>
        <option>Size/fit</option>
        <option>Other</option>
      </select>
      <label for="note">Anything else? (optional)</label>
      <textarea id="note" name="note" rows="3"></textarea>
      <button type="submit">Submit return request</button>
    </form>
  </div>`;
}
