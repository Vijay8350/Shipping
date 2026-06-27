# Shipping Management — SaaS shipping & logistics aggregator for Shopify

A **non-embedded** Shopify app (Remix + Polaris) for Indian e-commerce merchants:
sync orders, connect couriers, create AWBs, track shipments, handle NDR/RTO/returns,
storefront tracking + EDD, and analytics. Billed via Shopify subscriptions + usage.

> Architecture / technical source of truth: [`CLAUDE.md`](./CLAUDE.md).
> Feature source of truth: `docs/shopify-logistics-app-spec.md` (not yet in repo).
> Build is phased — see [`BUILD-PHASES.md`](./BUILD-PHASES.md). **This repo currently
> contains Phase 0 (foundation) only.**

## Stack

Remix (Node, TS strict) · React + Polaris · `@shopify/shopify-app-remix` (OAuth, offline
tokens, cookie sessions) · Prisma + **Postgres** · Redis + **BullMQ** · **PM2** (`web` +
`worker`) on AWS EC2 · RDS Postgres · ElastiCache Redis.

> ⚠️ This is a **non-embedded** app: `isEmbeddedApp: false`, no App Bridge, cookie-session
> auth. Shopify OAuth *is* the login. See `CLAUDE.md §2`.

## What Phase 0 delivers

- Non-embedded OAuth / SSO redirect flow (entry → offline-session check → OAuth → cookie → `/dashboard`).
- Prisma + Postgres with `Shop` + `Session` models (Postgres only — never SQLite).
- Redis/BullMQ connection wiring (no jobs yet) and a runnable `worker` process.
- PM2 `ecosystem.config.cjs` running `web` + `worker`.
- Polaris app shell (collapsible sidebar + top bar) on our own domain.
- AES-256-GCM encrypt/decrypt helpers (+ passing round-trip unit test).

## Local development

### Prerequisites
- Node ≥ 20.10
- A reachable **Postgres** database (local Postgres or an RDS instance — *not* SQLite)
- A reachable **Redis** instance (local Redis or ElastiCache)
- A Shopify Partner app + a development store (for the OAuth flow)

### Setup
```bash
npm install
cp .env.example .env          # then fill in every value
# generate a 32-byte key for APP_ENCRYPTION_KEY and a SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npx prisma migrate dev --name init   # creates Shop + Session tables in Postgres
```

### Run
```bash
npm run dev          # Remix web server (http://localhost:3000)
npm run worker:dev   # BullMQ worker (prints "worker up" once Redis connects)
```

For the OAuth flow to work end-to-end, expose the web server over HTTPS (e.g. the
Shopify CLI tunnel or `cloudflared`) and set that URL as `SHOPIFY_APP_URL` and the
app's `application_url` / redirect URLs in `shopify.app.toml` + the Partner Dashboard.

### Tests / typecheck
```bash
npm test          # vitest (crypto round-trip, etc.)
npm run typecheck # tsc --noEmit
```

## Production (AWS EC2, single box) — outline

```
Nginx/ALB (TLS) ──► web (Remix, PM2)
                    worker (BullMQ + crons, PM2)
        RDS Postgres ◄── Prisma     ElastiCache Redis ◄── BullMQ
```

1. Provision EC2 + RDS Postgres + ElastiCache Redis (same VPC/security groups).
2. Clone repo, `npm ci`, set `.env` (or PM2 `env`), `npm run build`, `npm run setup`
   (`prisma generate && prisma migrate deploy`).
3. `pm2 start ecosystem.config.cjs` → brings up `web` + `worker`.
4. Put Nginx (or ALB) in front, terminating TLS and proxying to the web process port.
5. The `worker` process can later be moved to its own EC2 instance unchanged.

## Project layout (CLAUDE.md §11)

```
app/                 Remix routes + UI
  components/         shared UI (Polaris app shell)
  lib/               crypto, navigation, (carriers/ + shopify/ land in later phases)
  routes/            _index (entry), auth.$ (OAuth), auth.login, dashboard, logout
  db.server.ts       shared Prisma client
  redis.server.ts    shared Redis connection (enqueue side)
  session.server.ts  our own signed session cookie (non-embedded login state)
  shopify.server.ts  non-embedded shopifyApp config + afterAuth
worker/              BullMQ consumers + crons (separate process)
prisma/schema.prisma Shop + Session (full model arrives in Phase 1)
ecosystem.config.cjs PM2 web + worker
```
