# App Store compliance checklist (Phase 6)

Status of the Shopify App Store submission requirements for this app. Re-verify current
policy on shopify.dev before submitting (policies change).

> ⚠️ This app is **non-embedded** by explicit decision (CLAUDE.md §2). Non-embedded apps
> are publishable but generally do **not** qualify for "Built for Shopify" and may face
> more review friction. Confirm current App Store eligibility before submission.

## Authentication & sessions
- [x] OAuth install flow (offline tokens) — `app/shopify.server.ts`, `app/routes/auth.$.tsx`
- [x] Own signed session cookie keeps merchant logged in — `app/session.server.ts`
- [x] Offline access token stored **encrypted** at rest (AES-256-GCM) — `Shop.accessToken`, `app/lib/crypto.server.ts`
- [x] Least-privilege scopes — `shopify.app.toml` / `SCOPES` (§10)

## Mandatory webhooks (HMAC-verified)
- [x] `app/uninstalled` → marks shop uninstalled, deletes sessions — `markShopUninstalled`
- [x] `customers/data_request` (compliance) — `app/routes/webhooks.tsx`
- [x] `customers/redact` (compliance) — `app/routes/webhooks.tsx`
- [x] `shop/redact` (compliance) — `app/routes/webhooks.tsx`
- [x] All webhooks HMAC-verified via `authenticate.webhook` before any processing
- [x] Webhook idempotency / dedupe — `WebhookLog(topic, payloadHash)` (§9.4)
- [ ] **TODO before submit:** implement actual data export/erasure logic in the compliance
      handlers (currently they verify + acknowledge + log). Wire to real deletion/export.

## Billing
- [x] Recurring USD plans via `appSubscriptionCreate` — `app/services/billing.server.ts`
- [x] Per-shipment overage via `appUsageRecordCreate` with a capped amount (§9.2)
- [x] Test charges by default (`test: true` unless `BILLING_LIVE=true`)
- [x] No double-billing — `UsageRecord.billed` + idempotency (§9.1), `splitIncludedOverage` (tested)
- [x] Plan gating on premium features — `app/lib/plans.ts`, dashboard widgets
- [ ] **TODO before submit:** handle `app_subscriptions/update` webhook to sync plan
      status changes (cancel/downgrade/frozen) as the source of truth.

## Data handling & security
- [x] Courier credentials encrypted at rest (AES-256-GCM) — `CourierAccount.credentials`
- [x] No secrets in code; all via env — `.env.example` (§12)
- [x] Secrets never logged (notification stub redacts recipient; adapters don't log creds)
- [x] App Proxy requests signature-verified — `authenticate.public.appProxy` (§10)

## Idempotency / correctness non-negotiables (§9)
- [x] Idempotent AWB creation (`idempotencyKey` per order+courier, unique constraint)
- [x] Usage metering from day one (UsageRecord written per billable shipment)
- [x] Canonical status normalization for every courier (§6) — adapter `status.ts` + tests

## Carriers
- [x] 7 couriers behind one contract: Delhivery, Shiprocket (bespoke); Bluedart, DTDC,
      Amazon Shipping, Shree Maruti, Trackon (generic REST adapter)
- [ ] **TODO before submit:** validate each courier's real request/response shapes against
      live sandbox credentials (§14). Bespoke adapters can replace generic ones in the
      registry with zero call-site changes.

## Listing / operational
- [ ] App listing assets (icon, screenshots, description, pricing) — manual
- [ ] Privacy policy + support contact URLs — manual
- [ ] Production infra: RDS Postgres + ElastiCache Redis + EC2 (PM2 web+worker), TLS via
      Nginx/ALB (CLAUDE.md §4); run `prisma migrate deploy`
- [ ] Verify HTTPS tunnel / production `SHOPIFY_APP_URL` matches `application_url` + redirect URLs

## Known caveats (carried from earlier phases, §14)
- Courier API field mappings are documented assumptions pending live validation.
- Reverse pickups reuse `createShipment` with swapped addresses (no courier-specific
  reverse/QC flag yet).
- Compliance webhook bodies are verified + logged but do not yet perform data export/erasure.
