// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
//
// Coach memory / RAG over full history (spec 007).
//
// Stores compact periodic summaries (week / month) of the athlete's history
// with an Ollama embedding, then retrieves the most relevant summaries for a
// coach query via brute-force cosine similarity. This is single-user /
// local-first with only a few hundred vectors, so an in-process cosine scan is
// fast and avoids a pgvector dependency the addon's Alpine Postgres can't
// reliably ship.
//
// Everything here degrades gracefully: when Ollama / embeddings are
// unavailable, retrieval falls back to deterministic rollups (or nothing), and
// the coach turn proceeds with the existing recent-window context.

import { and, eq, gte, notInArray } from "@acme/db";
import { db } from "@acme/db/client";
import { Activity, HistoryEmbedding } from "@acme/db/schema";

import { ollamaEmbed } from "./ollama";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Whether coach memory is enabled. Defaults ON when an Ollama URL is
 * configured (the addon sets OLLAMA_URL when the user wires Ollama), so it
 * lights up automatically without a separate toggle.
 */
export function isMemoryEnabled(): boolean {
  const flag = process.env.COACH_MEMORY_ENABLED;
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return Boolean(process.env.OLLAMA_URL);
}

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

export function cosineSim(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------------------------------------------------------------------------
// Period keys
// ---------------------------------------------------------------------------

/** ISO-8601 week key, e.g. "2024-W07". */
export function isoWeekKey(d: Date): string {
  // Copy date, shift to Thursday of the current week (ISO weeks anchor on it).
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000),
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Month key, e.g. "2024-03". */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Summary building
// ---------------------------------------------------------------------------

export interface PeriodSummary {
  periodType: "week" | "month" | "year";
  periodKey: string;
  summaryText: string;
  metrics: Record<string, number | string | null>;
}

interface ActivityRow {
  startedAt: Date;
  sportType: string;
  durationMinutes: number;
  distanceMeters: number | null;
  strainScore: number | null;
  trimpScore: number | null;
}

function km(meters: number): number {
  return Math.round((meters / 1000) * 10) / 10;
}

function summarizeBucket(
  periodType: "week" | "month" | "year",
  periodKey: string,
  rows: ActivityRow[],
): PeriodSummary {
  const count = rows.length;
  const totalMin = Math.round(
    rows.reduce((s, r) => s + (r.durationMinutes || 0), 0),
  );
  const totalKm = km(rows.reduce((s, r) => s + (r.distanceMeters ?? 0), 0));
  const totalLoad =
    Math.round(
      rows.reduce((s, r) => s + (r.strainScore ?? r.trimpScore ?? 0), 0) * 10,
    ) / 10;
  const bySport = new Map<string, number>();
  for (const r of rows)
    bySport.set(r.sportType, (bySport.get(r.sportType) ?? 0) + 1);
  const sportBreakdown = [...bySport.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sport, n]) => `${n} ${sport}`)
    .join(", ");
  const longestKm = km(
    rows.reduce((m, r) => Math.max(m, r.distanceMeters ?? 0), 0),
  );

  const label =
    periodType === "week" ? "Week" : periodType === "year" ? "Year" : "Month";
  const summaryText =
    `${label} ${periodKey}: ${count} activities (${sportBreakdown}), ` +
    `${totalKm} km, ${Math.floor(totalMin / 60)}h ${totalMin % 60}m, ` +
    `total load ${totalLoad}, longest ${longestKm} km.`;

  return {
    periodType,
    periodKey,
    summaryText,
    metrics: {
      activityCount: count,
      totalKm,
      totalMinutes: totalMin,
      totalLoad,
      longestKm,
    },
  };
}

/**
 * Build week + month summaries for the athlete from stored activities. Pure
 * aggregation; no LLM involvement. Returns oldest→newest within each type.
 */
export async function buildPeriodSummaries(
  userId: string,
  lookbackDays = 366 * 7, // up to ~7 years
): Promise<PeriodSummary[]> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const rows = (await db.query.Activity.findMany({
    where: and(eq(Activity.userId, userId), gte(Activity.startedAt, since)),
    columns: {
      startedAt: true,
      sportType: true,
      durationMinutes: true,
      distanceMeters: true,
      strainScore: true,
      trimpScore: true,
    },
  })) as ActivityRow[];

  const weekBuckets = new Map<string, ActivityRow[]>();
  const monthBuckets = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    const d = new Date(r.startedAt);
    const wk = isoWeekKey(d);
    const mk = monthKey(d);
    (weekBuckets.get(wk) ?? weekBuckets.set(wk, []).get(wk)!).push(r);
    (monthBuckets.get(mk) ?? monthBuckets.set(mk, []).get(mk)!).push(r);
  }

  const summaries: PeriodSummary[] = [];
  for (const [key, bucket] of weekBuckets)
    summaries.push(summarizeBucket("week", key, bucket));
  for (const [key, bucket] of monthBuckets)
    summaries.push(summarizeBucket("month", key, bucket));
  summaries.sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  return summaries;
}

// ---------------------------------------------------------------------------
// Embedding population
// ---------------------------------------------------------------------------

/**
 * Recompute and embed periodic summaries for the athlete, upserting into
 * `history_embedding`. Returns the number of rows written. Safe to run
 * repeatedly (idempotent on userId+periodType+periodKey). When embeddings are
 * unavailable the summary text is still stored (embedding NULL) so deterministic
 * rollups keep working.
 */
export async function summarizeAndEmbedHistory(
  userId: string,
): Promise<{ written: number; embedded: number }> {
  const summaries = await buildPeriodSummaries(userId);
  const model = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
  let written = 0;
  let embedded = 0;

  for (const s of summaries) {
    const embedding = await ollamaEmbed(s.summaryText);
    if (embedding) embedded++;
    await db
      .insert(HistoryEmbedding)
      .values({
        userId,
        periodType: s.periodType,
        periodKey: s.periodKey,
        summaryText: s.summaryText,
        embedding: embedding ?? null,
        metrics: s.metrics,
        model: embedding ? model : null,
      })
      .onConflictDoUpdate({
        target: [
          HistoryEmbedding.userId,
          HistoryEmbedding.periodType,
          HistoryEmbedding.periodKey,
        ],
        set: {
          summaryText: s.summaryText,
          embedding: embedding ?? null,
          metrics: s.metrics,
          model: embedding ? model : null,
          updatedAt: new Date(),
        },
      });
    written++;
  }

  // Prune embeddings for periods that no longer have any activity (e.g. an
  // activity was deleted/re-synced), so stale summaries can't be retrieved.
  const liveKeys = summaries.map((s) => s.periodKey);
  if (liveKeys.length > 0) {
    await db
      .delete(HistoryEmbedding)
      .where(
        and(
          eq(HistoryEmbedding.userId, userId),
          notInArray(HistoryEmbedding.periodKey, liveKeys),
        ),
      );
  } else {
    await db
      .delete(HistoryEmbedding)
      .where(eq(HistoryEmbedding.userId, userId));
  }

  return { written, embedded };
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export interface HistoryRetrieval {
  /** Top-K semantically relevant period summaries (newest-biased on ties). */
  summaries: string[];
  /** Deterministic whole-history rollup for "all / this year" style queries. */
  rollup: string | null;
}

/**
 * Deterministic rollup straight from stored activities — never the LLM. Used to
 * ground aggregate claims ("X runs, Y km this year").
 */
async function yearRollup(userId: string): Promise<string | null> {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const rows = (await db.query.Activity.findMany({
    where: and(eq(Activity.userId, userId), gte(Activity.startedAt, yearStart)),
    columns: {
      startedAt: true,
      sportType: true,
      durationMinutes: true,
      distanceMeters: true,
      strainScore: true,
      trimpScore: true,
    },
  })) as ActivityRow[];
  if (rows.length === 0) return null;
  return summarizeBucket("year", String(yearStart.getUTCFullYear()), rows)
    .summaryText;
}

/**
 * Retrieve the most relevant historical summaries for a coach query. Embeds the
 * query, brute-force cosine-ranks the athlete's stored summaries, and returns
 * the top-K plus a deterministic year rollup. Returns empty arrays (no throw)
 * whenever memory is disabled or embeddings are unavailable.
 */
export async function retrieveHistory(
  userId: string,
  queryText: string,
  k = 6,
): Promise<HistoryRetrieval> {
  if (!isMemoryEnabled()) return { summaries: [], rollup: null };

  const rollup = await yearRollup(userId);

  const queryVec = await ollamaEmbed(queryText);
  if (!queryVec) {
    // No embeddings — still hand back the deterministic rollup.
    return { summaries: [], rollup };
  }

  const rows = await db.query.HistoryEmbedding.findMany({
    where: eq(HistoryEmbedding.userId, userId),
    columns: { summaryText: true, embedding: true, periodKey: true },
  });

  const scored = rows
    .filter(
      (
        r,
      ): r is { summaryText: string; embedding: number[]; periodKey: string } =>
        Array.isArray(r.embedding) && r.embedding.length === queryVec.length,
    )
    .map((r) => ({
      text: r.summaryText,
      key: r.periodKey,
      score: cosineSim(queryVec, r.embedding),
    }))
    .sort((a, b) => b.score - a.score || b.key.localeCompare(a.key))
    .slice(0, k);

  return { summaries: scored.map((s) => s.text), rollup };
}

/**
 * Render a retrieval into a delimited prompt block, or "" when there is
 * nothing to add (so disabled/empty memory injects no noise).
 */
export function renderHistoryBlock(retrieval: HistoryRetrieval): string {
  const parts: string[] = [];
  if (retrieval.rollup) parts.push(retrieval.rollup);
  if (retrieval.summaries.length > 0) parts.push(...retrieval.summaries);
  if (parts.length === 0) return "";
  return `[HISTORY]\n${parts.join("\n")}\n[/HISTORY]`;
}
