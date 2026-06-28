# CLAUDE.md — Project Constitution

> This file is the single source of truth for Claude Code. Keep it open in context
> for every session. Do not contradict it. If a build prompt conflicts with this
> file, this file wins — stop and ask.

---

## 0. Current repository state (read first)

**Phases 0–3 are built.** Foundation + data/sync + carrier adapters + the worker tracking
poller / tracking UI / pickups / fulfillment push-back are in and verified offline
(typecheck, build, 30 unit tests pass). **Phases 4–6 are not built.** Work the next phase
from `BUILD-PHASES.md`, one per session (§14). **Next up: Phase 4** (NDR/RTO, returns
lifecycle, notifications stub + templates).

What exists now (Phase 0 — foundation):
- Non-embedded OAuth/SSO flow (§2): `app/routes/_index.tsx` (entry decision) →
  `auth.$.tsx` (OAuth) → `afterAuth` in `app/shopify.server.ts` sets our own signed
  cookie → `/dashboard`. Login state cookie lives in `app/session.server.ts`.
- `app/shopify.server.ts` — `shopifyApp({ isEmbeddedApp: false, useOnlineTokens: false })`
  with `PrismaSessionStorage`. `apiVersion` is omitted (library default = current stable).
- `app/lib/crypto.server.ts` — AES-256-GCM helpers (§9.3) + test.
- `app/redis.server.ts` (enqueue side) + `worker/` (BullMQ).
- Polaris shell `app/components/AppShell.tsx` driven by `app/lib/navigation.ts`.
- `ecosystem.config.cjs` (PM2 `web` + `worker`), `.env.example`, `README.md`.

What exists now (Phase 1 — data + sync):
- **Full Prisma schema** (§8): all models + indexes + the `ShipmentStatus` enum (§6).
  Baseline migration at `prisma/migrations/0_init/` (apply with `prisma migrate deploy`).
- **Webhooks** (§9.4–9.5, §10): registered in `app/shopify.server.ts` (`afterAuth`
  `registerWebhooks`); single HMAC-verified endpoint `app/routes/webhooks.tsx`; dedupe via
  `WebhookLog(topic, payloadHash)`; heavy work ENQUEUED, never inline. Compliance topics
  declared in `shopify.app.toml` `[webhooks.privacy_compliance]`. `app/uninstalled` marks
  the shop uninstalled (`markShopUninstalled`).
- **Order sync**: `app/services/orders.server.ts` (`upsertOrder`, `backfillOrders`); pure
  mappers `app/lib/shopify/order-mapper.ts` (REST webhook + GraphQL shapes); plain GraphQL
  client `app/lib/shopify/admin-graphql.server.ts` (worker has no Remix ctx). Backfill is
  enqueued in `afterAuth` and consumed by `worker/processors/backfill.ts`.
- **Queues**: names/types in `app/lib/queue-names.ts` (shared, pure); enqueue helpers in
  `app/lib/queues.server.ts`; consumers in `worker/processors/`.
- **All Orders screen**: `app/routes/orders._index.tsx` (Polaris IndexTable, status tabs,
  search, pagination, badges via `app/lib/order-status.ts`); rows link to order detail.

What exists now (Phase 2 — carriers):
- **Adapter contract** `app/lib/carriers/types.ts` (§7); **registry**
  `app/lib/carriers/registry.ts` resolves by courierKey + holds UI credential-field specs.
  App code never instantiates an adapter directly — always via the registry.
- **Delhivery + Shiprocket** adapters under `app/lib/carriers/<key>/` (all 6 methods),
  each with a `status.ts` normalizer (§6) and fixture tests using an injected `fetch`
  (`test-helpers.ts`). Exact courier field mappings still need live-sandbox validation (§14).
- **Encrypted creds + test mode**: `app/services/courier-accounts.server.ts` (decrypts
  only in-memory to build an adapter); pickup origin in
  `app/services/pickup-addresses.server.ts` + `PickupAddress` model.
- **Idempotent ship workflow** `app/services/shipping.server.ts` (§9.1:
  `idempotencyKey = orderId:courierKey`, returns existing shipment, unique-constraint
  race guard) → writes `UsageRecord` (§9.2, `usage.server.ts`).
- **In-app PDFs** `app/services/pdf.server.ts` (pdfkit): label + manifest. Routes:
  `logistics.tsx` (Logistics Config), `orders.$id.tsx` (detail + ship panel),
  `labels.$shipmentId.tsx` (label PDF), `manifest[.]pdf.tsx` (manifest PDF).
- Order model gained `shippingAddress1/2` (needed to ship) — Phase 2 migration
  `prisma/migrations/1_phase2_pickup_address/`.

What exists now (Phase 3 — tracking/pickups/fulfill-back):
- **Tracking poller** (§5): worker repeatable `TRACKING_POLLER` (every
  `TRACKING_INTERVAL_MS`, default 15m, `upsertJobScheduler`) fans out one
  `TRACKING_SHIPMENT` job per active shipment → `applyTrackingResult` writes
  TrackingEvents + advances canonical status (`app/services/tracking.server.ts`, pure
  helpers tested). On-demand "Track now" enqueues the same job.
- **Fulfillment push-back** (§10): `app/services/fulfillment.server.ts` creates a Shopify
  Fulfillment (`fulfillmentCreateV2`) with tracking number+URL when a shipment is moving;
  idempotent via `Shipment.shopifyFulfillmentId`. Enqueued from the track processor.
- **Order Tracking screen** `app/routes/tracking.tsx` (timeline + filters by
  status/courier/date). **Pickup Requests** `app/routes/pickups.tsx` +
  `app/services/pickups.server.ts` + `PickupRequest` model.
- **Real shipment actions** on `orders.$id.tsx`: Track now, Cancel shipment
  (`cancelShipment`), Reprint label.
- Schema: `Shipment.externalShipmentId` (courier id for label/pickup/cancel),
  `shopifyFulfillmentId`, `lastTrackedAt`; `PickupRequest`. Phase 3 migration
  `prisma/migrations/2_phase3_tracking_pickups/`.

### Commands
```bash
npm install                          # deps
npm run dev                          # Remix web server (http://localhost:3000)
npm run worker:dev                   # BullMQ worker (prints "worker up" once Redis connects)
npm run build                        # production build (Remix/Vite)
npm start                            # serve the production build
npm run typecheck                    # tsc --noEmit
npm test                             # vitest run (all tests)
npx vitest run app/lib/crypto.server.test.ts   # a single test file
npx vitest -t "round-trips a secret"           # a single test by name (watch)
npx prisma migrate dev --name <name> # create/apply a migration (needs a live Postgres)
npx prisma generate                  # regenerate the Prisma client after schema edits
npm run setup                        # prisma generate && prisma migrate deploy (prod)
pm2 start ecosystem.config.cjs       # run web + worker under PM2
```

> ⚠️ **What local verification CANNOT cover without infra/credentials:** end-to-end
> OAuth (needs a Shopify Partner app + dev store + public HTTPS tunnel as
> `SHOPIFY_APP_URL`), Prisma migrate/runtime (needs a reachable Postgres — never
> SQLite, §3), and the worker actually connecting (needs Redis). `npm test`,
> `npm run typecheck`, and `npm run build` are the checks that run offline.

Files in the repo and how they relate:

| File | Role |
|---|---|
| `CLAUDE.md` (this file) | **Technical / architecture source of truth.** Wins on stack, auth, data model, conventions. |
| `BUILD-PHASES.md` | The 7 phase prompts (Phase 0–6). **Run exactly one phase per session**, in order; tick its Acceptance Criteria before moving on. Re-read this file (and §13 here) to know what comes next. |
| `FULL-APP-MASTER-PROMPT.md` | Self-contained kickoff brief — a restatement of this file + the phase list. Reference, not a second source of truth. |
| `AGENTS.md` | Short orientation for AI agents; points back here. |
| `README.md` | Local dev + EC2 deploy instructions (generated in Phase 0). |
| `JSY Logistics Dashboard.html` | ~430 KB **bundled visual design prototype** of the merchant dashboard. Use it as the UI/layout reference when building Polaris screens; it is not runnable app code. |
| `docs/shopify-logistics-app-spec.md` | **Referenced everywhere as the FEATURE source of truth (the 16 modules) but DOES NOT EXIST yet.** If a phase needs feature detail from it, stop and ask the user for the spec rather than inventing module behavior. |

**Next up: Phase 4** (NDR + RTO handling, Returns lifecycle state machine incl. reverse
AWB, NotificationProvider interface + stub + dispatcher + NotificationLog, email/SMS
template management). Do not start it until asked — one phase per session.

---

## 1. What we are building

A **SaaS shipping & logistics aggregator** for Indian e-commerce merchants on Shopify
(an "ILS" / Shiprocket-Shipway-NimbusPost style app).

From one dashboard a merchant can: sync Shopify orders, connect multiple courier
companies, create AWBs / ship, print labels & manifests, track shipments, handle
NDR & RTO, run self-service returns, send email/SMS notifications, show a branded
tracking page + estimated delivery date (EDD) on their storefront, and view analytics.

Revenue = Shopify-billed **subscription plans (USD)** + **per-shipment usage/overage**.

The functional spec lives in `docs/shopify-logistics-app-spec.md` (the 16 modules).
**That spec is the feature source of truth; this file is the technical/architecture
source of truth.**

---

## 2. The ONE architectural fact that drives everything

**This is a NON-EMBEDDED Shopify app.** It does **not** render inside the Shopify
admin iframe. There is **no App Bridge** and **no session-token auth**.

### Auth / SSO flow (build exactly this)
1. Merchant clicks the app in their Shopify admin.
2. Shopify opens our **App URL** (on our own domain) with `shop` + `host` params.
3. Our app checks for a valid **offline session** for that `shop`:
   - **Found** → set our own signed **session cookie** → redirect to `/dashboard`.
   - **Not found** → run Shopify **OAuth** (grant screen → callback) → store the
     **offline access token** → set session cookie → redirect to `/dashboard`.
4. From then on, the **session cookie on our domain** keeps them logged in.
   Shopify OAuth **is** the login — there is **no separate username/password**.

### What this means concretely
- In the Shopify config set **`isEmbeddedApp: false`** (no App Bridge import).
- Use **cookie-based session storage** (Prisma session storage), not session tokens.
- Polaris is used purely for visual consistency; it runs standalone on our domain.
- ⚠️ Non-embedded apps are publishable but generally **do not qualify for
  "Built for Shopify"** status and may face more review friction. Re-verify the
  current App Store policy on shopify.dev before submitting. We build non-embedded
  by explicit decision.

---

## 3. Tech stack (do not substitute without asking)

| Layer | Choice |
|---|---|
| Framework | **Shopify Remix app template** (Node) |
| UI | **React + Shopify Polaris** |
| Auth | `@shopify/shopify-app-remix` (OAuth, offline tokens, cookie sessions) |
| ORM | **Prisma** |
| DB | **Postgres** (AWS **RDS**) — never SQLite in any environment |
| Queue / cache | **Redis** (AWS **ElastiCache**) via **BullMQ** |
| Background worker | BullMQ worker **process** (same codebase) |
| Process mgr | **PM2** (runs `web` + `worker` on one EC2 box) |
| Host | **AWS EC2** (single instance to start) |
| PDF | in-app generation (labels, invoices, manifests) — `pdfkit` or `puppeteer` |
| Email/SMS | **stubbed behind an interface now**; MSG91 (SMS) + SES (email) later |

---

## 4. Deployment topology

```
                 ┌──────────────────────── AWS ────────────────────────┐
 Merchant ──►    │   EC2 (single box, PM2)                              │
 (own domain)    │     ├─ process: web    (Remix server)               │
                 │     └─ process: worker (BullMQ consumers + crons)    │
                 │                                                      │
                 │   RDS Postgres  ◄── Prisma                           │
                 │   ElastiCache Redis  ◄── BullMQ                      │
                 └──────────────────────────────────────────────────────┘
```

- **One EC2 box runs both processes** (cheap/simple for launch). The worker is a
  separate PM2 process so it can later move to its own instance with **zero code
  change** — keep web and worker code cleanly separated.
- Web and worker share the same Prisma client and the same Redis connection config.
- Nginx (or ALB) terminates TLS → proxies to the Remix web process.

---

## 5. Background worker — what runs off the web thread

Anything slow, scheduled, or retryable lives in the **worker**, never in a request:
- **Tracking poller** (cron): poll each courier for active shipments, write
  `TrackingEvent`s, update `Shipment.status`, push fulfillment/tracking back to Shopify.
- **Status normalization**: map every courier's raw codes → our canonical status set.
- **Notification dispatcher**: send queued email/SMS via the provider interface.
- **Automation rules**: auto-fulfill / auto-ship / auto-assign-courier.
- **Usage metering**: emit Shopify usage records for billable shipments.
- **Webhook processing**: heavy webhook work is enqueued, not done inline.

---

## 6. Canonical shipment status set (normalize ALL couriers to this)

`READY_TO_SHIP` · `SHIPPED` · `IN_TRANSIT` · `OUT_FOR_DELIVERY` · `DELIVERED`
· `NDR` · `RTO_INITIATED` · `RTO_DELIVERED` · `CANCELLED` · `RETURN_INITIATED`
· `RETURN_RECEIVED`

Every adapter MUST map its raw status into exactly one of these. Keep the raw
status string too (store both). The UI only ever reads the canonical status.

---

## 7. The Carrier Adapter contract (the heart of the app)

Every courier implements the **same interface**. The app code never special-cases a
courier outside its adapter.

```ts
interface CarrierAdapter {
  readonly key: string;            // 'delhivery' | 'shiprocket' | ...
  readonly displayName: string;

  checkServiceability(input: ServiceabilityInput): Promise<ServiceabilityResult>;
  createShipment(input: CreateShipmentInput): Promise<ShipmentResult>; // returns AWB
  schedulePickup(input: PickupInput): Promise<PickupResult>;
  getLabel(input: { awb: string }): Promise<{ pdf: Buffer | string }>;
  track(input: { awb: string }): Promise<TrackingResult>;  // raw + normalized
  cancel(input: { awb: string }): Promise<CancelResult>;
}
```

Rules:
- Build **Delhivery + Shiprocket first** to prove the contract, THEN mass-produce
  Bluedart, DTDC, Amazon Shipping, Shree Maruti, Trackon.
- Adapters read credentials from the encrypted `CourierAccount` record — never from
  env or hardcoded.
- A **global test-mode toggle** per merchant routes adapters to sandbox endpoints.
- `createShipment` MUST be **idempotent** (see §9).

---

## 8. Data model (Prisma sketch — refine in Phase 1)

Core tables (names are canonical):
- **Shop** — shop domain, offline access token (encrypted), plan, install state.
- **Session** — Shopify cookie session storage.
- **CourierAccount** — shopId, courierKey, **encrypted credentials (JSON)**, testMode, enabled.
- **Order** — mirror of relevant Shopify order fields + sync status.
- **Shipment** — orderId, courierKey, **awb (unique)**, canonical status, rawStatus,
  label ref, **idempotencyKey (unique)**, costs, timestamps.
- **TrackingEvent** — shipmentId, canonical status, rawStatus, location, occurredAt.
- **Return** — orderId, reason, state machine status, reverse AWB, customer comms refs.
- **NotificationLog** — channel, template, recipient, status, providerMsgId.
- **UsageRecord** — shopId, shipmentId, billed flag, shopifyUsageRecordId.
- **Subscription** — shopId, plan, shopifyAppSubscriptionId, status, period.
- **WebhookLog** — topic, shopId, payload hash, processedAt (for idempotency/dedupe).
- **AutomationRule** — shopId, trigger, conditions(JSON), action(JSON), enabled.

Indexes: `Shipment.awb`, `Shipment.idempotencyKey`, `Order.shopifyId`,
`WebhookLog(topic, payloadHash)`.

---

## 9. Non-negotiables baked in from day one

1. **Idempotent AWB creation.** Generate an `idempotencyKey` per (order + courier)
   before calling the adapter. If a `Shipment` with that key exists, return it —
   never create a duplicate AWB / never double-charge usage.
2. **Usage metering from day one.** Every billable shipment writes a `UsageRecord`
   and emits a Shopify usage record. Wire this in Phase 0/1, not at the end.
3. **Encrypted courier credentials.** `CourierAccount.credentials` encrypted at rest
   (AES-256-GCM via a `APP_ENCRYPTION_KEY`). Never log decrypted secrets.
4. **Webhook idempotency.** Dedupe via `WebhookLog(topic, payloadHash)`.
5. **Mandatory Shopify compliance webhooks** implemented and verified:
   `customers/data_request`, `customers/redact`, `shop/redact`. HMAC-verify ALL webhooks.
6. **Notifications behind an interface** (`NotificationProvider`) — stub now, swap
   MSG91/SES later with zero call-site changes.

---

## 10. Shopify integration surface

- **API:** GraphQL Admin API (current stable version) via `@shopify/shopify-app-remix`.
- **Scopes (start set):** `read_orders, write_orders, read_fulfillments,
  write_fulfillments, read_products, write_merchant_managed_fulfillment_orders`
  (refine per feature; request least privilege).
- **Webhooks:** `orders/create`, `orders/updated`, `orders/cancelled`,
  `fulfillments/create`, `app/uninstalled` + the 3 mandatory compliance topics.
- **Billing:** Shopify **Billing API** — `appSubscriptionCreate` for recurring USD
  plans, `appUsageRecordCreate` for per-shipment overage, capped usage.
- **Storefront pieces:** delivered via **App Proxy** (branded tracking page, EDD,
  self-serve returns page) — server-rendered from our domain through the proxy.

---

## 11. Conventions

- TypeScript everywhere. Strict mode on.
- Folder split: `app/` (Remix routes/UI), `app/lib/carriers/` (adapters),
  `app/lib/shopify/`, `worker/` (BullMQ consumers + crons), `app/services/`
  (business logic — keep routes thin).
- Routes thin; logic in services; adapters pure and testable.
- Every adapter ships with a unit test against recorded fixture responses.
- All money in **minor units (integer)**; currency stored alongside.
- No secret in code or logs. All secrets via env (see §12).
- Conventional commits. One phase = one feature branch.

---

## 12. Environment variables (`.env`)

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=https://app.yourdomain.com
SCOPES=read_orders,write_orders,read_fulfillments,write_fulfillments,read_products
DATABASE_URL=postgresql://...rds...
REDIS_URL=redis://...elasticache...
APP_ENCRYPTION_KEY=            # 32-byte key for AES-256-GCM (courier creds)
SESSION_SECRET=
# Couriers (per-merchant creds live in DB; these are app-level/sandbox where needed)
# Notifications (stubbed for now)
# MSG91_AUTH_KEY=   SES_REGION=   SES_FROM=
```

---

## 13. Build order (high level — see BUILD-PHASES.md for the prompts)

0. Foundation: non-embedded OAuth + Prisma/RDS + Polaris shell + PM2/EC2 skeleton.
1. Data model + Shopify order sync + webhooks (incl. compliance) + Orders screen.
2. Carrier adapter framework + **Delhivery & Shiprocket** + AWB + label + idempotency.
3. Worker: tracking poller + status normalization + tracking screen + pickups + fulfill-back.
4. NDR/RTO + Returns lifecycle + Notifications (stubbed) + templates/settings.
5. Storefront via App Proxy: branded tracking page + EDD + self-serve returns.
6. Billing + usage metering + remaining 5 couriers + analytics + App Store compliance pass.

---

## 14. Guardrails for Claude Code

- **Do exactly one phase per session.** Don't run ahead into the next phase.
- If something here is ambiguous, **stop and ask** — don't invent a courier API shape.
- Never hardcode courier logic outside its adapter.
- Never weaken: idempotency, credential encryption, webhook HMAC, usage metering.
- Keep web and worker code separate so the worker can move to its own box later.
- After each phase, output: what changed, how to run it locally, and the
  acceptance-criteria checklist from the phase prompt, ticked off.
