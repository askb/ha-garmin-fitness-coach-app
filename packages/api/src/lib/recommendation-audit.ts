// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod/v4";

import type { RecommendationAuditKind } from "@acme/db/schema";
import { db } from "@acme/db/client";
import {
  CreateRecommendationAuditSchema,
  RecommendationAudit,
} from "@acme/db/schema";

const InputSchema = CreateRecommendationAuditSchema;

export type { RecommendationAuditKind };
export type RecordAuditInput = z.input<typeof InputSchema>;

/**
 * The ONE entry point for writing to RecommendationAudit. All coach
 * mutations MUST go through this. Validates via the Zod schema (which
 * enforces the kind enum at runtime), then inserts. Returns the new row.
 *
 * Imports use the deep `@acme/db/client` and `@acme/db/schema`
 * subpaths rather than the `@acme/db` barrel so consumers that pull
 * audit helpers don't transitively instantiate the pg.Pool when
 * they only need the helper signature (e.g. unit tests, type-only
 * downstream code).
 *
 * Tests assert this is the only writer to the table.
 */
export async function recordRecommendationAudit(input: RecordAuditInput) {
  const parsed = InputSchema.parse(input);
  const [row] = await db.insert(RecommendationAudit).values(parsed).returning();
  if (!row) throw new Error("Recommendation audit insert returned no row");
  return row;
}
