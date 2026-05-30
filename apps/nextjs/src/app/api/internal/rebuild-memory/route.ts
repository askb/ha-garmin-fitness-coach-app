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

import { db } from "@acme/db/client";

import { isMemoryEnabled, summarizeAndEmbedHistory } from "@acme/api/memory";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  // eslint-disable-next-line no-restricted-properties
  const expected = process.env.INTERNAL_TASK_TOKEN;
  if (!expected) return true; // local-first default: no token required
  return req.headers.get("x-internal-token") === expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { success: false, message: "unauthorized" },
      { status: 401 },
    );
  }
  if (!isMemoryEnabled()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: "Coach memory disabled (no OLLAMA_URL / COACH_MEMORY_ENABLED).",
    });
  }

  try {
    const users = await db.query.user.findMany({ columns: { id: true } });
    const results: { userId: string; written: number; embedded: number }[] = [];
    for (const u of users) {
      const r = await summarizeAndEmbedHistory(u.id);
      results.push({ userId: u.id, ...r });
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
