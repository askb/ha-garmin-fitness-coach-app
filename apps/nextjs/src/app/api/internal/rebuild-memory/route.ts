// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
//
// Internal endpoint: (re)build coach memory embeddings (spec 007).
// Intended to be invoked by the addon on a nightly cron (or after a sync):
//   curl -X POST http://127.0.0.1:3000/api/internal/rebuild-memory
//
// Best-effort and idempotent. When Ollama embeddings are unavailable the
// summaries are still stored (embedding NULL) so deterministic rollups work.

import { NextResponse } from "next/server";

import {
  isLearningEnabled,
  recomputeOutcomeAttribution,
} from "@acme/api/learning";
import { isMemoryEnabled, summarizeAndEmbedHistory } from "@acme/api/memory";
import { db } from "@acme/db/client";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  // eslint-disable-next-line no-restricted-properties
  const expected = process.env.INTERNAL_TASK_TOKEN;
  if (expected) return req.headers.get("x-internal-token") === expected;
  // Fail closed when no token is configured. The addon injects
  // INTERNAL_TASK_TOKEN automatically; the only way to run this unauthenticated
  // is an explicit opt-in for bare local-dev setups.
  // eslint-disable-next-line no-restricted-properties
  return process.env.INTERNAL_TASK_ALLOW_INSECURE === "true";
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { success: false, message: "unauthorized" },
      { status: 401 },
    );
  }
  const memoryEnabled = isMemoryEnabled();
  const learningEnabled = isLearningEnabled();
  if (!memoryEnabled && !learningEnabled) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message:
        "Coach memory + learning disabled (no OLLAMA_URL / COACH_MEMORY_ENABLED / LEARNING_ATTRIBUTION_ENABLED).",
    });
  }

  try {
    const users = await db.query.user.findMany({ columns: { id: true } });
    const results: {
      userId: string;
      written: number;
      embedded: number;
      rulesScored: number;
    }[] = [];
    for (const u of users) {
      const mem = memoryEnabled
        ? await summarizeAndEmbedHistory(u.id)
        : { written: 0, embedded: 0 };
      const rules = learningEnabled
        ? await recomputeOutcomeAttribution(u.id)
        : [];
      results.push({ userId: u.id, ...mem, rulesScored: rules.length });
    }
    return NextResponse.json({ success: true, users: results.length, results });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "rebuild failed",
      },
      { status: 500 },
    );
  }
}
