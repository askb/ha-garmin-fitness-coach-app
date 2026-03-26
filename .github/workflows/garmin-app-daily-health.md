---
on:
  schedule: daily on weekdays

permissions:
  contents: read
  issues: read
  pull-requests: read

network: defaults

safe-outputs:
  create-issue:
    title-prefix: "[daily-health] "
    labels: [report, daily-health]
    close-older-issues: true
    max: 1
---

# Daily GarminCoach App Health Report

Generate a daily health report for the GarminCoach Next.js application repository.

## Context

This is a pnpm turbo monorepo containing an AI-powered fitness coaching app:
- **apps/nextjs** — Next.js 16 web app with 16+ pages (dashboard, training, insights, coach chat)
- **packages/api** — tRPC routers (analytics, readiness, proactive AI, session reports, interventions)
- **packages/db** — Drizzle ORM schema with 20+ PostgreSQL tables
- **packages/engine** — Pure TypeScript computation (baselines, load, anomalies)

The app runs as a Home Assistant addon and also standalone for development.

## Instructions

Create a concise daily health report as a GitHub issue covering:

### 1. Repository Activity (last 24h)
- Recent commits and what changed
- Open pull requests needing review (especially Dependabot bumps)
- Any CI/CD failures in recent workflow runs

### 2. Codebase Stats
- Count of tRPC routers in `packages/api/src/router/`
- Count of pages in `apps/nextjs/src/app/`
- Count of tables in `packages/db/src/schema.ts` (grep for `pgTable`)
- Count of test files in `apps/nextjs/src/__tests__/`
- Count of engine modules in `packages/engine/src/`

### 3. Potential Issues
- Check for `@ts-ignore` or `@ts-expect-error` in source files
- Check for `console.log` statements that should be removed
- Check for TODO/FIXME/HACK comments that need attention
- Look for unused imports or dead code patterns
- Check if `packages/db/src/seed.ts` safety check is intact (should refuse on real data)
- Verify all tRPC routers are registered in `packages/api/src/root.ts`

### 4. Dependency Health
- Check for outdated critical dependencies (Next.js, tRPC, Drizzle)
- Flag any open Dependabot PRs older than 7 days
- Check for security advisories in `package.json` dependencies

### 4b. Security & PII Scan
- **Scan for hardcoded IP addresses** (e.g., 192.168.x.x) in source, scripts, and config — should use env vars
- **Scan for personal email addresses** (excluding maintainer SPDX headers and example.com)
- **Scan for URLs containing embedded credentials** (user:pass@host)
- **Check for personal names or identifiable health data** in code or comments (not generic feature labels)
- Flag any `.env` or `.env.local` files committed (should be in .gitignore)
- Verify `.env.example` contains only placeholder values (no real secrets)

### 5. Test Health
- Run `pnpm --filter nextjs test -- --passWithNoTests` if possible, or check latest CI run
- Count total test cases across all test files
- Flag any test files with `.skip` or `.todo` markers

### 6. Recommendations
- Suggest improvements based on what you find
- Flag any pages missing error boundaries
- Note any routers missing input validation

### 7. Spec Kit Health
- List all active specs in `specs/` directory (skip `.gitkeep`)
- For each spec directory, check completeness:
  - ✅ Has `spec.md` (requirements defined)
  - ✅ Has `plan.md` (implementation planned)
  - ✅ Has `tasks.md` (work breakdown exists)
  - ⚠️ Missing any of the above
- Check `tasks.md` files for unchecked items (`- [ ]`) — report count of pending vs done
- Flag specs not modified in the last 14 days as potentially stale
- If `specs/` is empty (only `.gitkeep`), note "No active feature specs — consider creating specs for planned work"

### Format
Use clear headings, bullet points, and emoji status indicators:
- ✅ Healthy
- ⚠️ Needs attention
- ❌ Action required

Keep the report under 600 words. Focus on actionable items only.
