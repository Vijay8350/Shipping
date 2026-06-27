# FULL APP MASTER PROMPT

> Paste this entire block into Claude Code to start the project. It is self-contained.
> If `CLAUDE.md` is also in the repo, follow it as the source of truth where they overlap.

---

```
You are my senior engineer building a production SaaS Shopify app with me. Read this
entire brief, then build it PHASE BY PHASE (the phase plan is at the bottom). Do not
attempt to build everything in one pass. Build one phase, prove it against its
acceptance criteria, then continue. If anything is ambiguous — especially a courier
API shape — STOP and ask me instead of inventing it.

═══════════════════════════════════════════════════════════════════════════
PRODUCT
═══════════════════════════════════════════════════════════════════════════
A SaaS shipping & logistics aggregator for Indian e-commerce merchants on Shopify
(a Shiprocket / Shipway / NimbusPost style "ILS" app). From one dashboard a merchant
can: sync Shopify orders, connect multiple courier companies, create AWBs and ship,
print labels/manifests, track shipments, handle NDR and RTO, run self-service returns,
send email/SMS notifications, show a branded tracking page + estimated delivery date
(EDD) on their storefront, and view analytics.

Revenue = Shopify-billed subscription plans (USD) + per-shipment usage/overage.

The detailed feature spec is in docs/shopify-logistics-app-spec.md (16 modules). That
file is the FEATURE source of truth; this brief is the ARCHITECTURE source of truth.

═══════════════════════════════════════════════════════════════════════════
THE ARCHITECTURAL FACT THAT DRIVES EVERYTHING — NON-EMBEDDED APP
═══════════════════════════════════════════════════════════════════════════
This is a NON-EMBEDDED Shopify app. It does NOT render inside the Shopify admin iframe.
No App Bridge, no session-token auth.

Auth / SSO flow (build EXACTLY this):
  1. Merchant clicks the app in their Shopify admin.
  2. Shopify opens our App URL (on our OWN domain) with shop + host params.
  3. App checks for a valid offline session for that shop:
       - Found     → set our signed session cookie → redirect to /dashboard.
       - Not found → run Shopify OAuth (grant → callback) → store offline access
                     token → set session cookie → redirect to /dashboard.
  4. The session cookie on our domain keeps them logged in. Shopify OAuth IS the
     login — there is NO separate username/password.

Concretely: set isEmbeddedApp: false, use Prisma cookie session storage (not session
tokens), no App Bridge. Polaris is used purely for visual consistency, running
standalone on our domain.
NOTE: non-embedded apps are publishable but generally do NOT qualify for "Built for
Shopify" and may face more review friction — this is an explicit, accepted decision.

═══════════════════════════════════════════════════════════════════════════
TECH STACK (do not substitute without asking)
═══════════════════════════════════════════════════════════════════════════
- Framework: Shopify Remix app template (Node, TypeScript strict)
- UI: React + Shopify Polaris
- Auth: @shopify/shopify-app-remix (OAuth, offline tokens, cookie sessions)
- ORM: Prisma
- DB: Postgres on AWS RDS — NEVER SQLite, in any environment
- Queue/cache: Redis on AWS ElastiCache, via BullMQ
- Worker: a separate BullMQ worker PROCESS in the same codebase
- Process manager: PM2 — runs `web` + `worker` on ONE EC2 box for launch
- Host: AWS EC2 (single instance to start; worker must be cleanly separable so it can
  move to its own box later with zero code change)
- PDF (labels/invoices/manifests): generated in-app (pdfkit or puppeteer)
- Email/SMS: STUBBED behind a NotificationProvider interface now; MSG91 (SMS) + SES
  (email) will be dropped in later with zero call-site changes

═══════════════════════════════════════════════════════════════════════════
DEPLOYMENT TOPOLOGY
═══════════════════════════════════════════════════════════════════════════
One EC2 box, PM2 running two processes: `web` (Remix server) and `worker` (BullMQ
consumers + cron jobs). RDS Postgres via Prisma. ElastiCache Redis via BullMQ. Nginx/
ALB terminates TLS and proxies to the web process. Keep web and worker code separated.

═══════════════════════════════════════════════════════════════════════════
BACKGROUND WORKER — what runs off the web thread
═══════════════════════════════════════════════════════════════════════════
Tracking poller (cron) · status normalization across all couriers · notification
dispatcher · automation rules (auto-fulfill / auto-ship / auto-assign courier) ·
usage metering · heavy webhook processing (enqueued, not inline).

═══════════════════════════════════════════════════════════════════════════
CANONICAL SHIPMENT STATUS SET — normalize ALL couriers to this
═══════════════════════════════════════════════════════════════════════════
READY_TO_SHIP · SHIPPED · IN_TRANSIT · OUT_FOR_DELIVERY · DELIVERED · NDR ·
RTO_INITIATED · RTO_DELIVERED · CANCELLED · RETURN_INITIATED · RETURN_RECEIVED
Every adapter maps its raw status to exactly one of these. Store BOTH raw and
normalized. UI only ever reads the canonical status.

═══════════════════════════════════════════════════════════════════════════
CARRIER ADAPTER CONTRACT — the heart of the app
═══════════════════════════════════════════════════════════════════════════
Every courier implements the SAME interface; app code never special-cases a courier
outside its adapter:

  interface CarrierAdapter {
    readonly key: string;          // 'delhivery' | 'shiprocket' | ...
    readonly displayName: string;
    checkServiceability(input): Promise<ServiceabilityResult>;
    createShipment(input): Promise<ShipmentResult>;   // returns AWB, idempotent
    schedulePickup(input): Promise<PickupResult>;
    getLabel(input: { awb }): Promise<{ pdf }>;
    track(input: { awb }): Promise<TrackingResult>;   // raw + normalized
    cancel(input: { awb }): Promise<CancelResult>;
  }

Couriers (7 real keys available): Delhivery, Shiprocket, Bluedart, DTDC,
Amazon Shipping, Shree Maruti, Trackon.
Build Delhivery + Shiprocket FIRST to prove the contract, THEN mass-produce the other
five. Adapters read credentials from the encrypted CourierAccount record (never env/
hardcoded). A per-merchant test-mode toggle routes adapters to sandbox endpoints. Each
adapter ships with unit tests against recorded fixture responses.

═══════════════════════════════════════════════════════════════════════════
DATA MODEL (Prisma — refine in Phase 1)
═══════════════════════════════════════════════════════════════════════════
Shop · Session · CourierAccount(encrypted credentials, testMode, enabled) ·
Order · Shipment(awb UNIQUE, idempotencyKey UNIQUE, canonical + raw status, costs) ·
TrackingEvent · Return(state machine, reverse AWB) · NotificationLog · UsageRecord ·
Subscription · WebhookLog(topic, payloadHash) · AutomationRule.
Indexes: Shipment.awb, Shipment.idempotencyKey, Order.shopifyId,
WebhookLog(topic, payloadHash). Money in integer minor units + currency.

═══════════════════════════════════════════════════════════════════════════
NON-NEGOTIABLES — baked in from day one (do NOT retrofit later)
═══════════════════════════════════════════════════════════════════════════
1. Idempotent AWB creation: generate idempotencyKey per (order+courier) before calling
   the adapter; if a Shipment with that key exists, return it — never duplicate the AWB
   or double-charge usage.
2. Usage metering from day one: every billable shipment writes a UsageRecord; Shopify
   usage emission wired so it isn't bolted on at the end.
3. Encrypted courier credentials: AES-256-GCM via APP_ENCRYPTION_KEY; never log secrets.
4. Webhook idempotency: dedupe via WebhookLog(topic, payloadHash); HMAC-verify ALL
   webhooks.
5. Mandatory Shopify compliance webhooks implemented + verified: customers/data_request,
   customers/redact, shop/redact.
6. Notifications behind the NotificationProvider interface — stub now, swap MSG91/SES
   later with zero call-site changes.

═══════════════════════════════════════════════════════════════════════════
SHOPIFY INTEGRATION SURFACE
═══════════════════════════════════════════════════════════════════════════
- GraphQL Admin API (current stable version) via @shopify/shopify-app-remix.
- Scopes (start, least-privilege, refine per feature): read_orders, write_orders,
  read_fulfillments, write_fulfillments, read_products,
  write_merchant_managed_fulfillment_orders.
- Webhooks: orders/create, orders/updated, orders/cancelled, fulfillments/create,
  app/uninstalled + the 3 mandatory compliance topics.
- Billing API: appSubscriptionCreate (recurring USD plans Free→Gold + Enterprise),
  appUsageRecordCreate (per-shipment overage) with a usage cap.
- Storefront pieces delivered via App Proxy (branded tracking page, EDD, self-serve
  returns), server-rendered from our domain through the proxy.

═══════════════════════════════════════════════════════════════════════════
FULL FEATURE SCOPE (the 16 modules — see the spec for detail)
═══════════════════════════════════════════════════════════════════════════
Dashboard & analytics · All Orders · Shipping / AWB creation · Order Tracking ·
Automation Rules · Pickup Requests · NDR handling · RTO handling · Returns (self-serve
+ admin lifecycle) · Tracking Page Settings (branded) · EDD settings · Return theme/
page · Logistics Config (courier connections) · Email + SMS notifications & templates ·
Billing / Plans / usage · Settings & general config. Apply plan-gated locks on premium
widgets/features throughout.

═══════════════════════════════════════════════════════════════════════════
CONVENTIONS
═══════════════════════════════════════════════════════════════════════════
TypeScript strict. Thin routes; business logic in app/services; adapters in
app/lib/carriers; worker in worker/. No secrets in code/logs (all via env). Conventional
commits, one phase = one feature branch. After each phase output: what changed, how to
run locally, and the phase's acceptance-criteria checklist ticked off.

ENV VARS: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SCOPES, DATABASE_URL
(RDS), REDIS_URL (ElastiCache), APP_ENCRYPTION_KEY (32-byte), SESSION_SECRET, and
(later) MSG91_AUTH_KEY, SES_REGION, SES_FROM.

═══════════════════════════════════════════════════════════════════════════
BUILD PHASES — do ONE per session, in order, prove acceptance criteria before moving on
═══════════════════════════════════════════════════════════════════════════
PHASE 0 — Foundation: scaffold Remix as NON-EMBEDDED, implement the OAuth/SSO redirect
  flow, Prisma+Postgres (Shop+Session), Redis/BullMQ wiring, PM2 web+worker, Polaris app
  shell, AES-256-GCM helpers, .env.example, deploy notes.
PHASE 1 — Full Prisma schema + indexes; register & HMAC-verify all webhooks (incl. 3
  compliance); webhook idempotency; order backfill + live sync; All Orders screen.
PHASE 2 — CarrierAdapter framework + registry; Delhivery + Shiprocket adapters;
  Logistics Config (encrypted creds, test mode, pickup addresses); ship workflow with
  idempotent AWB + label/manifest PDFs; write UsageRecord per shipment; adapter unit
  tests.
PHASE 3 — Worker tracking poller (cron) + status normalization; push fulfillment +
  tracking back to Shopify; Order Tracking screen; Pickup Requests; real row actions
  (track/cancel/reprint).
PHASE 4 — NDR + RTO handling; Returns lifecycle state machine (incl. reverse AWB);
  NotificationProvider interface + STUB + dispatcher + NotificationLog; email/SMS
  template management.
PHASE 5 — App Proxy storefront: branded tracking page, EDD display, self-serve returns
  page; Customer Experience settings screens.
PHASE 6 — Shopify Billing (USD plans + plan gating); usage/overage emission with cap +
  no double-billing; remaining 5 adapters (Bluedart, DTDC, Amazon Shipping, Shree
  Maruti, Trackon) with tests; analytics dashboard (KPIs + charts); App Store compliance
  pass + submission checklist.

Start with PHASE 0 now. Confirm your understanding and list exactly what you will create
in Phase 0 before writing code.
```
