<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Project Memory — ha-garmin-fitness-coach-app

Durable facts for Claude Code sessions that are not obvious from the code alone.

## Architecture split

- **This repo (app)**: pnpm/turbo monorepo (create-t3-turbo base) — Next.js app
  in `apps/nextjs`, shared packages under `packages/` (`@acme/*` namespace).
- **Companion repo (addon)**: `askb/ha-garmin-fitness-coach-addon` — Home
  Assistant addon "PulseCoach" that **bundles tagged releases of this app**
  into its Docker image. Version bumps here (package.json `version`) drive
  addon bundle updates (e.g. addon commit "bundle app v0.22.0").

## Deployment

- Deploys to **Vercel** via `vercel.json` (buildCommand
  `pnpm turbo build --filter=@acme/nextjs`, output `apps/nextjs/.next`).
- `.github/workflows/vercel-deploy.yml` is **manual only**
  (`workflow_dispatch`) — needs `VERCEL_TOKEN` / `VERCEL_ORG_ID` /
  `VERCEL_PROJECT_ID` repo secrets before first use.
- CI workflows use `./tooling/github/setup` composite (pnpm + node from
  `.nvmrc` + `pnpm install`); reuse it in new workflows.

## Conventions

- All GitHub Actions pinned to full SHA with `# vX.Y.Z` comment; repo runs
  **zizmor** — avoid `${{ }}` interpolation inside `run:` blocks (pass via
  `env:` instead), add `persist-credentials: false` to checkout, and start
  jobs with `step-security/harden-runner`.
- REUSE-compliant (`REUSE.toml` aggregate annotations); `**/*.py` is NOT
  covered — Python files need inline SPDX headers.
- `postinstall` runs sherif (`lint:ws`) — workspace dependency mismatches
  fail installs.
- Auth: better-auth with Discord OAuth; Garmin Health API keys + webhook
  secret in env (see `.env.example`).

## Harness

- `evals/` documents behavioral eval scenarios for the AI coach; `tests/`
  currently holds one pytest file (`test_collect_failures.py`); JS/TS tests
  run per-package via `pnpm test` (turbo).
- `.claude/settings.json` has a PreToolUse hook blocking reads/writes of
  `.env*` (except `.env.example`).
