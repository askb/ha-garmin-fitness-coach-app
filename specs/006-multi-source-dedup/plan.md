# 006: Multi-Source Dedup — Implementation Plan

## Approach

Build a deduplication engine that runs after each sync to identify and resolve
duplicate activities. The engine uses fuzzy matching on time, sport, and duration
to find candidates, then applies a richness score to select the preferred source.

## Architecture Decisions

- Fuzzy matching over exact matching: different platforms record slightly
  different start times and durations for the same activity
- Richness-based preference: automatically pick the source with more data
  fields rather than always preferring one platform
- Soft delete for discarded duplicates: keep the data but mark it as
  superseded, enabling undo and audit
- Run dedup post-sync: simpler than real-time and ensures all data is
  available for comparison

## Components Affected

- New `packages/engine/src/dedup.ts` — matching algorithm and richness scoring
- `packages/db` schema — add dedup status and source-link fields to activities
- `packages/api/src/router/` — add dedup resolution endpoints and activity
  source metadata
- Activity list UI — show dedup badges and manual override controls

## Dependencies

- Spec 004 (Strava OAuth) must be implemented first — dedup requires at least
  two data sources
- Activity model must include a `source` field to identify origin platform
- Understanding of data completeness per platform to calibrate richness scoring
