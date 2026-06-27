/**
 * Pinned GraphQL Admin API version (CLAUDE.md §10). Keep in sync with
 * shopify.app.toml [webhooks] api_version. The Remix library uses its own default for
 * authenticated requests; this constant is for the plain fetch client used by the
 * worker (which has no Remix request context).
 */
export const ADMIN_API_VERSION = "2025-01";
