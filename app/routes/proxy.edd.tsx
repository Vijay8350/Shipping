import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { computeEdd } from "../services/edd.server";

/**
 * EDD endpoint served through the App Proxy (CLAUDE.md §10). A theme block / storefront
 * script fetches this with the customer's pincode and renders the estimate near the
 * product/cart. Returns JSON. Storefront URL: /apps/ils/edd?pincode=XXXXXX
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop") ?? "";
  const pincode = (url.searchParams.get("pincode") ?? "").trim();

  if (!/^\d{6}$/.test(pincode)) {
    return json({ ok: false, error: "Enter a valid 6-digit pincode." }, { status: 400 });
  }

  const result = await computeEdd(shopDomain, pincode);
  if (!result.serviceable) {
    return json({ ok: true, serviceable: false });
  }
  return json({
    ok: true,
    serviceable: true,
    courier: result.courier,
    label: result.range?.label,
    minDate: result.range?.minDate,
    maxDate: result.range?.maxDate,
  });
}
