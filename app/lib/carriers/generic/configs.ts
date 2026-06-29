import type { GenericCourierConfig } from "./adapter";

/**
 * The five Phase 6 couriers (CLAUDE.md §7) implemented via the generic REST adapter.
 * Auth-header shapes are best-effort; base URLs/paths and exact auth MUST be validated
 * against each courier's live API before production (§14). Adding a fully bespoke adapter
 * later is a drop-in replacement in the registry — no call-site changes.
 */
const tokenHeader = (field: string, prefix = "") => (creds: Record<string, unknown>) => {
  const v = creds[field];
  if (!v) throw new Error(`missing ${field} credential`);
  return { Authorization: `${prefix}${String(v)}` };
};

export const GENERIC_COURIER_CONFIGS: GenericCourierConfig[] = [
  {
    key: "bluedart",
    displayName: "Blue Dart",
    prodBase: "https://api.bluedart.com/v1",
    stagingBase: "https://apigateway-sandbox.bluedart.com/v1",
    credentialFields: [
      { name: "apiKey", label: "API key", type: "password", required: true },
      { name: "licenseKey", label: "License key", type: "password", required: false },
    ],
    authHeaders: tokenHeader("apiKey"),
    trackingUrl: (awb) => `https://www.bluedart.com/tracking/${encodeURIComponent(awb)}`,
  },
  {
    key: "dtdc",
    displayName: "DTDC",
    prodBase: "https://api.dtdc.com/v1",
    credentialFields: [
      { name: "apiKey", label: "API token", type: "password", required: true },
      { name: "customerCode", label: "Customer code", type: "text", required: false },
    ],
    authHeaders: (creds) => ({ "api-key": String(creds.apiKey ?? "") }),
    trackingUrl: (awb) => `https://www.dtdc.in/tracking/${encodeURIComponent(awb)}`,
  },
  {
    key: "amazon_shipping",
    displayName: "Amazon Shipping",
    prodBase: "https://sellingpartnerapi-eu.amazon.com/shipping/v2",
    credentialFields: [
      { name: "accessToken", label: "SP-API access token", type: "password", required: true },
    ],
    authHeaders: tokenHeader("accessToken", "Bearer "),
  },
  {
    key: "shree_maruti",
    displayName: "Shree Maruti",
    prodBase: "https://api.shreemaruti.com/v1",
    credentialFields: [
      { name: "apiKey", label: "API key", type: "password", required: true },
    ],
    authHeaders: tokenHeader("apiKey", "Bearer "),
  },
  {
    key: "trackon",
    displayName: "Trackon",
    prodBase: "https://api.trackon.in/v1",
    credentialFields: [
      { name: "apiKey", label: "API key", type: "password", required: true },
    ],
    authHeaders: tokenHeader("apiKey"),
    trackingUrl: (awb) => `https://trackon.in/tracking/${encodeURIComponent(awb)}`,
  },
];
