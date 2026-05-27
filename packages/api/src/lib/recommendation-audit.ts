// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod/v4";

import type { RecommendationAuditKind } from "@acme/db";
import {
  CreateRecommendationAuditSchema,
  db,
  RecommendationAudit,
} from "@acme/db";

const InputSchema = CreateRecommendationAuditSchema;

export type { RecommendationAuditKind };
export type RecordAuditInput = z.input<typeof InputSchema>;

/**
 * The ONE entry point for writing to RecommendationAudit. All coach
 * mutations MUST go through this. Validates via the Zod schema (which
 * enforces the kind enum at runtime), then inserts. Returns the new row.
 *
 * Tests assert this is the only writer to the table.
 */
export async function recordRecommendationAudit(input: RecordAuditInput) {
  const parsed = InputSchema.parse(input);
  const [row] = await db.insert(RecommendationAudit).values(parsed).returning();
  if (!row) throw new Error("Recommendation audit insert returned no row");
  return row;
}
