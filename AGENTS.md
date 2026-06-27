# AGENTS

This repository is an early-stage Shopify logistics SaaS app defined by architecture and phased delivery docs.

## Primary guidance for AI agents

- Treat `CLAUDE.md` as the single source of truth for architecture, conventions, and non-negotiable requirements.
- Use `BUILD-PHASES.md` to drive work one phase at a time. Do not move to the next phase until the current phase is complete.
- `FULL-APP-MASTER-PROMPT.md` contains the full user-facing prompt for starting a new Claude Code session.

## Key project constraints

- Non-embedded Shopify app: no App Bridge, no session-token auth, cookie session auth only.
- Tech stack: Shopify Remix (Node + TypeScript strict), React + Polaris, Prisma + Postgres, Redis + BullMQ, PM2 web+worker.
- Do not substitute core stack choices without asking.
- Follow the project-specific conventions in `CLAUDE.md`:
  - `app/` for Remix routes/UI
  - `app/lib/carriers/` for courier adapters
  - `app/lib/shopify/` for Shopify integration
  - `worker/` for BullMQ consumers and cron jobs
  - `app/services/` for business logic
- Keep routes thin and business logic separate.

## Current workspace state

- The repository currently contains planning documentation only.
- There is no existing application code, package manifest, or config files present.
- When implementing code, start by scaffolding the Phase 0 foundation described in `BUILD-PHASES.md`.

## Recommended behavior

- Prefer linking to the existing docs rather than copying them.
- Keep responses concise and focused on the current phase.
- If the requirement is ambiguous, ask rather than inventing a behavior.
- Preserve the one-phase-per-session rule strictly.

## Useful starting point

- Begin with `BUILD-PHASES.md` Phase 0: scaffold a non-embedded Shopify Remix app, provide Prisma/Postgres wiring, Polaris shell, PM2 `web` + `worker`, and AES-256-GCM helpers.
