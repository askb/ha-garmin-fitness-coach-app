<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
