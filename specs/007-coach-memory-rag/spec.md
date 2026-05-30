# 007: Coach Memory & Retrieval (RAG over full history)

## Status: Draft

## Problem Statement

The coach chat previously had **amnesia about long-term history**. When asked
*"analyse all my runs done this year and give me a report"*, it replied:

> "I only have information for one run in the last 14 days: 10 minutes, 1.1km…"

**Partial fix already shipped (#224, v0.17.x):** `data-context.ts` now has
`detectAggregateIntent()` — aggregate phrasing ("all my", "this year",
"report", "since…", "trend") widens the SQL window to **365 days / 500
activities** and a YTD projection is always queried. The user's exact phrase
now triggers aggregate mode.

**Remaining gaps this spec addresses (the *scaling* problem):**

1. **Beyond 1 year.** `windowDays` caps at 365. PulseCoach holds **6+ years**
   of data; "how has my sleep trended since 2019" or "my marathon block in
   2022" is still out of reach.
2. **Token budget / cost.** Dumping up to 500 activities as raw text into every
   aggregate prompt is expensive and will blow the context window on local
   models (`gpt-oss:20b`). A naive wider window makes this worse.
3. **Semantic / narrative retrieval.** Date-window selection can't answer
   "tell me about my hardest training block" or "compare my best and worst
   months" — these need *similarity* retrieval, not a calendar slice.

So the next step is a **retrieval layer**: embed compact periodic summaries
once, then semantically fetch only the relevant slices on demand — unbounded in
time, bounded in tokens. It complements (does not replace) the #224 windowing.

## Goals

- Coach can answer **multi-year** aggregate / narrative questions grounded in
  real data (beyond the #224 365-day SQL window).
- Bounded token cost regardless of history length (retrieve top-K summaries,
  not raw 500-activity dumps).
- No regression to the #224 aggregate windowing or the recent precise window.
- Fully local — embeddings via Ollama (`/api/embeddings`), vectors in Postgres
  (`pgvector`). No external API, consistent with the privacy-first design.
- Degrades gracefully when pgvector / embeddings are unavailable (falls back to
  today's behaviour).

## Requirements

- [ ] Add `pgvector` extension + a `history_embedding` table
      (userId, period_type [week|month|activity|year], period_key, summary_text,
      embedding vector, metrics jsonb, created_at).
- [ ] Nightly (or post-sync) job computes rolling **summaries**:
      weekly + monthly aggregates (volume, load/CTL/ATL/TSB deltas, PRs,
      notable changes from `findNotableChanges`, sleep/HRV trend), and
      per-activity one-line descriptions. Embed each via Ollama
      `nomic-embed-text` (or configured model); upsert into `history_embedding`.
- [ ] Add `packages/api/src/lib/memory.ts`:
      `retrieveHistory(userId, queryText, k)` → semantic search (cosine) over
      `history_embedding`, returns top-K summaries + a deterministic
      whole-history rollup (counts/totals) for "all/this year" style queries.
- [ ] `data-context.ts` gains a retrieval section: when the user message looks
      aggregate/long-range (or always, cheaply), inject retrieved summaries
      under a clearly delimited `[HISTORY]…[/HISTORY]` block, alongside the
      existing recent structured context.
- [ ] Intent hint: lightweight detector for aggregate scope
      ("this year", "all my", "since", "trend", "history", "average over") to
      decide retrieval breadth (recent-K vs year rollup vs full).
- [ ] Config flag `COACH_MEMORY_ENABLED` (default on when `OLLAMA_URL` set);
      addon exposes `ollama_url` already — reuse it for embeddings.

## Acceptance Criteria

- [ ] Asking "analyse all my runs this year" yields a grounded report citing
      real totals (e.g. run count, total distance, load trend) — not "one run
      in 14 days".
- [ ] Asking "how's my sleep trended since I started?" returns a multi-year
      narrative consistent with `trends`/`findNotableChanges` output.
- [ ] Recent precise questions ("what should today look like?") are unchanged
      and still fast.
- [ ] With pgvector/embeddings disabled, behaviour matches current main (no
      crash, no empty `[HISTORY]` noise).
- [ ] Retrieval adds < ~1s p50 to a coach turn on the user's box.
- [ ] Numeric claims in the history block come from deterministic rollups, not
      the LLM (feeds the future LLM quality gate, spec TBD).

## Out of Scope

- Online learning / policy tuning from outcomes (separate: "close the learning
  loop" / `ai-loop-close-learning`).
- Cross-user / federated memory.
- Forecasting (separate: `ai-loop-forecasting`).
- Replacing the structured recent-window context — this augments it.

## Technical Context

- DB: Drizzle + Postgres (`packages/db/src/schema.ts`). pgvector via
  `drizzle-orm` `vector()` column or raw SQL migration.
- Embeddings: Ollama already wired in addon (`OLLAMA_URL`,
  `http://192.168.1.77:11434`, model `gpt-oss:20b` for chat; add a small
  embed model `nomic-embed-text`). `packages/api/src/lib/ollama.ts` is the
  place to add an `ollamaEmbed()` helper.
- Context assembly: `packages/api/src/lib/data-context.ts`.
- Summary inputs already exist: `computeDailyPMCSeries`, `analyzeTrend`,
  `findNotableChanges`, `computeStandardCorrelations`, activity rows.
- Coach entrypoint: `packages/api/src/router/chat.ts` (the
  `haConversationChat → ollamaChat → fallback` chain).
- Population job can live addon-side (`metrics-compute.py`) or as a TS cron in
  the app; prefer TS so it shares the engine summary functions.

## Phasing

- **Phase 1 (MVP):** pgvector table + weekly/monthly summary embeddings +
  `retrieveHistory` + `data-context` injection + aggregate-intent detector.
  Deterministic year rollup for "all/this year".
- **Phase 2:** per-activity embeddings for "tell me about my long runs in
  March"; correlation-aware retrieval.
- **Phase 3:** feed retrieved + deterministic rollups into an LLM numeric-claim
  quality gate (links to `ai-loop-llm-quality-gate`).
