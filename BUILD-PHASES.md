# BUILD-PHASES.md — Claude Code Prompt Sequence

How to use this file:
- Put `CLAUDE.md` and `docs/shopify-logistics-app-spec.md` in the repo root first.
- Run **one phase per Claude Code session.** Paste the phase prompt as-is.
- Each phase ends with **Acceptance Criteria** — don't move on until all are ticked.
- At the start of every phase, Claude Code should re-read `CLAUDE.md`.

---

## PHASE 0 — Foundation: non-embedded app + infra skeleton

```
Read CLAUDE.md fully before doing anything. We are building a NON-EMBEDDED Shopify
app (no App Bridge, no embedded iframe, cookie-session auth — see CLAUDE.md §2).

Scaffold the project:
1. Initialize the Shopify Remix app template (Node, TypeScript strict).
2. Configure it as NON-EMBEDDED: isEmbeddedApp: false, Prisma cookie session storage,
   no App Bridge. App URL points to our own domain.
3. Implement the exact auth/SSO flow in CLAUDE.md §2: merchant clicks app in admin →
   our App URL → check offline session → OAuth if missing → set cookie → redirect to
   /dashboard. Shopify OAuth is the only login; no username/password.
4. Prisma + Postgres (DATABASE_URL → RDS). NEVER SQLite. Create the Shop + Session
   models only for now. Run an initial migration.
5. Set up Redis/BullMQ connection config (no jobs yet) so worker wiring exists.
6. Create two runnable processes via PM2: `web` (Remix) and `worker` (empty BullMQ
   bootstrap that connects to Redis and logs "worker up"). Add an ecosystem.config.js.
7. Build the Polaris app shell on our domain: left sidebar nav (groups from CLAUDE.md /
   the spec), top bar with store name + logout, collapsible. A placeholder /dashboard.
8. AES-256-GCM encrypt/decrypt helpers using APP_ENCRYPTION_KEY (for later use).
9. .env.example with every var from CLAUDE.md §12. README: local run + EC2 deploy notes.

Do NOT build orders, couriers, billing, or webhooks yet.

Acceptance Criteria:
[ ] Fresh install OAuth works end-to-end and lands on /dashboard with no manual login.
[ ] Re-opening the app from admin skips OAuth (valid cookie session) and goes straight in.
[ ] App runs against Postgres (RDS-compatible), not SQLite.
[ ] `pm2 start` brings up both `web` and `worker`; worker connects to Redis.
[ ] Polaris shell renders on our own domain (confirm it is NOT in an admin iframe).
[ ] Encryption helpers have a passing round-trip unit test.
```

---

## PHASE 1 — Data model + order sync + webhooks

```
Re-read CLAUDE.md. Phase 0 is complete.

1. Implement the full Prisma schema from CLAUDE.md §8 (Order, Shipment, TrackingEvent,
   Return, NotificationLog, UsageRecord, Subscription, WebhookLog, AutomationRule,
   CourierAccount). Add the indexes listed. Migrate.
2. Register Shopify webhooks: orders/create, orders/updated, orders/cancelled,
   fulfillments/create, app/uninstalled, AND the 3 mandatory compliance webhooks
   (customers/data_request, customers/redact, shop/redact). HMAC-verify all of them.
3. Webhook idempotency via WebhookLog(topic, payloadHash). Heavy work is ENQUEUED to
   the worker, not done inline in the request.
4. Initial backfill: on first load, pull recent orders via GraphQL Admin API into the
   Order table. Keep Orders in sync via the webhooks.
5. Build the "All Orders" screen: Polaris data table with status tabs, search, filters,
   pagination, and the semantic status badges. Row actions are stubs for now.
6. app/uninstalled must clean up / mark the shop uninstalled.

Do NOT build shipping/AWB or couriers yet — order rows just display.

Acceptance Criteria:
[ ] All Prisma models + indexes migrated cleanly.
[ ] Creating/updating an order in the dev store appears in All Orders within seconds.
[ ] All webhooks HMAC-verified; duplicate deliveries are ignored (dedupe works).
[ ] The 3 compliance webhooks return correctly and are logged.
[ ] Orders screen filters/paginates over real synced data with correct status badges.
```

---

## PHASE 2 — Carrier adapter framework + Delhivery & Shiprocket

```
Re-read CLAUDE.md, especially §6 (status set), §7 (adapter contract), §9 (idempotency,
encryption). Phase 1 is complete.

1. Implement the CarrierAdapter interface from §7 and a registry that resolves an
   adapter by courierKey.
2. Build TWO adapters only: Delhivery and Shiprocket. Each implements all methods:
   checkServiceability, createShipment (returns AWB), schedulePickup, getLabel, track,
   cancel. Map raw statuses → the canonical set (§6); store raw + normalized.
3. Credentials come from CourierAccount (encrypted JSON), never env/hardcoded. Honor
   the per-merchant test-mode toggle to hit sandbox endpoints.
4. Logistics Config screen: connect/disable couriers, enter credentials (stored
   encrypted), toggle test mode, set pickup address(es).
5. Ship workflow from an order: pick courier → checkServiceability → createShipment →
   store Shipment with a pre-generated idempotencyKey (§9). If a Shipment with that key
   exists, return it — NO duplicate AWB. Generate/fetch the label PDF (getLabel).
6. Label + manifest PDF generation in-app.
7. Write the UsageRecord row on successful billable shipment (DB only for now; Shopify
   usage emission comes in Phase 6) — wire the hook now so it's not retrofitted.
8. Unit tests for both adapters against recorded fixture responses.

Acceptance Criteria:
[ ] A real (test-mode) order can be shipped via Delhivery AND via Shiprocket, producing
    an AWB and a downloadable label PDF.
[ ] Re-running ship on the same order+courier returns the SAME AWB (idempotent).
[ ] Raw statuses correctly normalize to the canonical set for both couriers.
[ ] Credentials are stored encrypted and never appear in logs.
[ ] Both adapters pass their fixture unit tests.
[ ] A UsageRecord is written per successful shipment.
```

---

## PHASE 3 — Worker: tracking poller + tracking UI + pickups + fulfill-back

```
Re-read CLAUDE.md §5 and §6. Phases 0–2 complete.

1. In the worker: a BullMQ repeatable (cron) job that polls track() for all active
   shipments (not in a terminal status), writes TrackingEvents, updates Shipment.status
   via the normalizer. Respect courier rate limits with sensible batching/backoff.
2. Push status back to Shopify: create/update Fulfillment with tracking number + URL
   when a shipment is SHIPPED/IN_TRANSIT; mark delivered appropriately.
3. Order Tracking screen: timeline of TrackingEvents per shipment, current canonical
   status, filters by status/courier/date.
4. Pickup Requests screen: schedulePickup via adapter; list/track pickup status.
5. Make order-row actions real (track, cancel shipment, reprint label).

Do NOT build returns, notifications, storefront, or billing yet.

Acceptance Criteria:
[ ] The cron polls active shipments on schedule and records TrackingEvents.
[ ] Shipment status transitions follow the canonical set and update the UI live.
[ ] Shopify fulfillment + tracking number is created/updated from our side.
[ ] Pickups can be scheduled and their status shown.
[ ] Cancel + reprint label work from the order row.
```

---

## PHASE 4 — NDR / RTO + Returns lifecycle + Notifications (stubbed)

```
Re-read CLAUDE.md §9.6. Phases 0–3 complete. Use the spec's Returns + NDR modules.

1. NDR handling: detect NDR status from tracking, surface an NDR worklist, allow
   re-attempt / action, log outcomes.
2. RTO: detect RTO_INITIATED/RTO_DELIVERED, reflect on order + dashboard.
3. Returns lifecycle state machine per the spec: customer submits return → Pending →
   admin Accept/Decline → on accept generate reverse-pickup AWB (adapter) + queue
   customer email → track until RETURN_RECEIVED. Build the Return Requests admin screen.
4. NotificationProvider INTERFACE + a no-op/console STUB implementation (see CLAUDE.md
   §9.6). All sends go through the worker's notification dispatcher and write
   NotificationLog. Do NOT integrate MSG91/SES yet — just the interface + stub.
5. Email + SMS template management screens (subject/body, variables, enable per event:
   order shipped, out for delivery, delivered, NDR, return accepted, etc.).

Acceptance Criteria:
[ ] NDR and RTO states are detected from tracking and shown in their worklists.
[ ] A return moves correctly through the full state machine incl. reverse AWB.
[ ] Every notification event routes through the provider interface + stub and writes
    a NotificationLog (swapping in a real provider later needs no call-site changes).
[ ] Templates are editable and gate which events fire.
```

---

## PHASE 5 — Storefront via App Proxy: tracking page + EDD + returns page

```
Re-read CLAUDE.md §10 (App Proxy). Phases 0–4 complete. Use the spec's Tracking Page,
EDD, and Return Theme modules.

1. Configure a Shopify App Proxy; server-render storefront pages from our domain.
2. Branded tracking page: merchant logo + theme color + custom CSS, date/time format,
   shows the shipment timeline. Only for shipments shipped through the app.
3. EDD (estimated delivery date) display configurable for product/cart/checkout-adjacent
   surfaces, driven by courier serviceability + configured transit times.
4. Self-service returns page (customer-facing) that feeds the Phase 4 returns flow.
5. Customer Experience settings screens to configure all three.

Acceptance Criteria:
[ ] Branded tracking page loads through the App Proxy with merchant branding applied.
[ ] EDD renders on the configured storefront surface from real serviceability data.
[ ] A customer can file a return from the storefront page and it appears as Pending.
```

---

## PHASE 6 — Billing + usage metering + remaining couriers + analytics + compliance

```
Re-read CLAUDE.md §9 and §10. Phases 0–5 complete. Final phase.

1. Shopify Billing API: USD plans (Free → Gold + Enterprise per the spec) via
   appSubscriptionCreate; plan selection + upgrade/downgrade UI; gate features by plan.
2. Usage/overage: emit Shopify usage records (appUsageRecordCreate) from the worker for
   billable shipments beyond plan limits, using the UsageRecords already being written.
   Respect a usage cap. Reconcile so no shipment is double-billed (idempotency, §9).
3. Add the remaining 5 adapters using the proven contract: Bluedart, DTDC,
   Amazon Shipping, Shree Maruti, Trackon. Each with fixture unit tests + status mapping.
4. Analytics dashboard: implement the KPI cards + all charts from the spec/design
   (order history, prepaid vs COD, payment status, logistics-wise, tracking-status
   history, returns). Apply plan-gated locks on premium widgets.
5. App Store compliance pass: confirm all mandatory webhooks, HMAC, data handling,
   uninstall cleanup, billing test charges, and listing requirements. Produce a
   submission checklist.

Acceptance Criteria:
[ ] A merchant can subscribe to a USD plan and see it reflected via the Billing API.
[ ] Billable shipments emit Shopify usage records with the cap respected and no
    double-billing.
[ ] All 7 couriers ship + track through the same adapter contract with passing tests.
[ ] Dashboard charts render real data with correct plan gating.
[ ] Compliance checklist passes; app is ready to submit for review.
```

---

## Cross-phase reminders

- One phase per session; never run ahead.
- If a courier API shape is unknown, stop and ask — don't invent it.
- Never weaken idempotency, credential encryption, webhook HMAC, or usage metering.
- Keep `web` and `worker` code separate so the worker can move to its own EC2 later.
- End every phase by ticking its Acceptance Criteria and writing run instructions.
