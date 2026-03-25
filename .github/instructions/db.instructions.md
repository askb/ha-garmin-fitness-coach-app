<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

---
applyTo: "packages/db/**"
---

# Database Package Instructions

## Drizzle ORM Conventions

- Schema files in `src/schema/`
- 22 tables covering: activities, metrics, sleep, zones, readiness, etc.
- Activities store `hrZoneMinutes` as JSONB: `{zone1: N, ..., zone5: N}`
- PostgreSQL 16 is the production database

## Migrations

- Generated via: `pnpm --filter @acme/db generate`
- Applied via: `pnpm --filter @acme/db push`
- Migration files in `drizzle/` directory
- Always test migrations against a fresh database

## Schema Changes

1. Modify schema files in `src/schema/`
2. Generate migration: `pnpm --filter @acme/db generate`
3. Review generated SQL
4. Test migration locally
5. Commit schema + migration together (one logical change)

## Important Types

- All schema types are exported from `src/schema/index.ts`
- Use Drizzle's `InferSelectModel<typeof table>` for type inference
- Zod schemas in `@acme/validators` must match DB schema
