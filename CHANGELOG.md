<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.24.0] - 2026-07-12

### Added

- **Stress Board interaction quick-add.** Log an out-of-calendar contact
  directly on the board: person input with attendee autocomplete, duration
  chips (15/30/45/60m), an "ended just now / N ago" selector, and a recent
  list with per-entry delete. Names respect screenshot mask mode; the panel
  hides itself on addons older than v0.26.0. Replaces hand-writing JSONL
  into `/share/pulsecoach/interactions.jsonl` via an HA shell_command.

## [0.23.0] - 2026-07-10

### Changed

- **Development harness hardening (no user-facing change).** Applied the
  deterministic harness audit remediations and AgentShield findings:
  deny-only Claude Code permissions, fail-secure secret-guard hooks
  (PreToolUse + Stop), durable project memory, behavioral coaching evals,
  a dispatch-only Vercel deploy workflow, and PR/issue templates plus
  CODEOWNERS.

## [0.22.0] - 2026-07-09

### Added

- **In-UI Google Calendar setup.** Connect a Google Calendar for the Stress
  Board from the dashboard by pasting the token from
  `generate-gcal-token.py` — no more copying the file into `/share`. An
  Unlink button clears it again.
- **Multiple calendars.** Once linked, a 📅 calendars panel lets you choose
  which of your Google calendars feed the board; events shared across
  calendars are counted once. Requires addon v0.22.0+ (older addons keep
  the file-drop flow).

## [0.21.0] - 2026-07-07

### Added

- **Stress Board mask toggle.** One-tap privacy mode for screenshots:
  attendees render as stable initials, meeting titles as generic labels.
  Real names remain the default for private use.

## [0.20.1] - 2026-07-06

### Fixed

- **Stress Board unreachable under HA ingress (#322).** The page fetched
  absolute `/api/garmin/meeting-stress` paths, which resolve against HA
  core instead of the ingress-prefixed app root, so the board always
  reported the auth server unreachable. Fetches now use the shared
  `getIngressUrl()` helper.

## [0.20.0] - 2026-07-06

### Added

- **Stress Board screen (#320).** New `/stress-board` page: the meeting
  stress leaderboard — per-person ridge marginal effects with
  calming↔stress bars and a per-meeting dbpm/z/elev table, matching the
  addon's meeting-stress output. Proxies the addon auth server via
  `/api/garmin/meeting-stress`, polls while a run is active, and guides
  setup when no calendar (linked Google Calendar or events file) is
  connected. Registered under Intelligence in the navigation menu.

### Fixed

- **Engine TRIMP in ETL, activity index, P1 cleanups (#289).**
- **Security: require session on garmin routes; untrack runtime
  artifacts (#288).**

## [0.19.0] - 2026-06-08

### Fixed

- **Restore `DEV_BYPASS_AUTH` single-user mode (#278).** The bypass had been
  gated to non-production environments, which broke the PulseCoach Home
  Assistant add-on — it runs `NODE_ENV=production` with `DEV_BYPASS_AUTH=true`
  as its documented single-user auth model (one user behind authenticated HA
  ingress). With the gate every `protectedProcedure` returned `UNAUTHORIZED`,
  so all dashboards rendered empty. The bypass is now an explicit opt-in that
  works in any environment; deployments that do not set the flag still require
  real authentication. The webhook HMAC verification and tRPC CORS allow-list
  hardening are retained.

### Added

- **Seed VO2max history (#277).** The 90-day demo seed now writes
  `garmin_official` VO2max readings per qualifying run plus a weekly
  `uth_ratio` series, so the Fitness page renders its VO2max trends, current
  value and race predictions instead of an empty state.

### Changed

- **Stop the e2e seed from wiping the demo history (#277).** `seed-e2e.ts`'s
  reset is now scoped to the rows it owns (today's metrics and `e2e-`
  activities) instead of deleting the full per-user history, so the 90-day
  data created by `seed.ts` survives when both seeds run (the add-on
  screenshot pipeline). The standalone coach-loop test is unaffected.

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
