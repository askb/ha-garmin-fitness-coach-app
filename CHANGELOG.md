<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.18.1] - 2026-05-31

### Fixed

- **Stacked Bar/Area charts no longer render empty (#257).** Recharts creates
  Bar/Area geometry only after its entry-animation frame fires; under React 19
  concurrent rendering on chart-heavy pages that frame could be dropped, so the
  bars/areas never painted (axes and legends still showed). Disabled entry
  animation (`isAnimationActive={false}`) on all Bar/Area/Pie/Radar series
  across the zones, sleep, fitness, hrv, vitals, training, and trends pages.
  Affected stacked charts (e.g. Weekly Time in Zones, Sleep Stages) now render
  immediately.
- **Out-of-range readiness values flagged in data validation (#258).** Garmin
  occasionally returns malformed Training Readiness payloads (e.g. `130`, `530`)
  outside the 0–100 scale. The Engine-vs-Garmin validation table now classifies
  readiness/VO2max values outside their valid range as `invalid` ("⚪ Out of
  range"), excludes them from the agreement percentage, and suppresses a
  misleading delta, so bad source data no longer inflates the reported
  agreement.

## [0.18.0] - 2026-05-31

### Added

- **AI-native closed-loop foundations: RAG memory + learning loop.** The coach now builds and queries a retrieval-augmented memory of multi-year history, enabling token-efficient semantic answers to aggregate questions (e.g. "analyse all my runs this year") instead of raw activity dumps, plus a learning loop that adapts over time.
- Persona-parameterized database seeding to drive the end-to-end screenshot/QA matrix across recreational, beginner, athlete, and detrained profiles.

### Changed

- Upgraded the lint/typecheck toolchain to ESLint 10, TypeScript 6, and `@eslint/compat` 2 (with `typescript-eslint` 8.60 and `eslint-plugin-turbo` 2.9), clearing the previously deferred majors.
- Hardened all CI workflows with Zizmor security scanning and SHA-pinned, Node 24 actions.
- Refreshed runtime and build dependencies (Next.js 16.2, Vite 8, Vitest 4, Tailwind 4.3, Drizzle 0.45, and related bumps).

## [0.17.8] - 2026-05-29

### Fixed

- Humanized Garmin activity slugs at the activity API boundary so Home/Activities views no longer surface raw versioned names like `Tennis_v2`.
- Fixed adherence mixed-window fallback so planless workout days can always be overlaid by same-window Garmin activities.
- Improved chat ordered-list renumbering to handle realistic LLM output with blank lines and short paragraph separators while staying idempotent.
- Increased dashboard version badge contrast/opacity for HA dark-theme visibility without changing Settings placement.

## [0.17.6] - 2026-05-28

### Fixed

- Adherence trends now treat planless `daily_workout` windows as Garmin-derived, and overlay Garmin activity onto mixed plan/no-plan windows.
- Chat history now re-renders older assistant messages with humanized activity names and renumbered ordered lists.
- The app now exposes its running version and build time in Settings and on the dashboard for easier diagnostics.

## [0.17.4] - 2026-05-28

### Fixed

- Settings now lets users pick, auto-detect, and save an IANA timezone.
- Adherence trends fall back from coach audits to workouts to Garmin activities.
- Adherence percentages now exclude no-plan rest days from the denominator.
- Coach chat responses now persist and return renumbered ordered lists.
- Coach chat prompts now humanize Garmin activity slugs such as `Tennis_v2`.

## [0.17.2] - 2026-05-28

### Fixed

- Dashboard greeting now reflects the user's configured timezone and local time of day.

## [0.17.1] - 2026-05-28

### Fixed

- TodayRecommendationCard: Accept/Skip/Defer buttons now align inside the card (was overflowing viewport)
- AdherenceTrendCard: empty-state copy clarified; falls back to deriving adherence from daily_workout history for users without RecommendationAudit rows yet
- TodayRecommendationCard: removed duplicate rule headline badge
- Coach LLM: enforce consecutive ordered-list numbering via system prompt + server-side renumberOrderedLists post-processor
- Coach LLM: humanize activity slugs (no more "Tennis_v2" leaking into prose)

## [0.17.0] - 2026-05-28 — AI-native coach loop

### Added

- Rules-first daily recommendation engine with inescapable RecommendationAudit (#206, #208, #209)
- TodayRecommendationCard with rule trace + accept/skip/defer (#211, #214)
- coach.accept/skip/defer mutations with audit-only side effects (#210)
- Planned-vs-actual reconciliation engine + coach.reconcile/adherenceTrend (#207, #212)
- AdherenceTrendCard with 7/14/28d windows (#213)
- Integration test suite (8 scenarios, real Postgres) (#215)
- Playwright e2e coach loop tests (#216)

### Changed

- Coach loop is now rules-first; LLM only frames explanations (test-enforced)
