# 006: Multi-Source Dedup

## Status: Draft

## Problem Statement

Users who connect multiple platforms (e.g., Garmin + Strava) will get duplicate
activities because the same workout is recorded on both services. Without
deduplication, training load, volume, and analytics will be inflated and
inaccurate.

## Requirements

- [ ] Detect duplicate activities across platforms using fuzzy matching
- [ ] Match criteria: start time within ±5 minutes AND same sport type AND
      duration within ±10%
- [ ] When duplicates are found, prefer the source with richer data (more
      data fields, higher resolution GPS/HR)
- [ ] Allow manual override of automatic dedup decisions
- [ ] Show dedup status on activity list (merged, kept, discarded)

## Acceptance Criteria

- [ ] Two activities from different sources that match the criteria are
      automatically merged into one
- [ ] The richer data source is preferred by default
- [ ] Users can see which activities were deduped and from which sources
- [ ] Users can manually split or re-merge incorrectly deduped activities
- [ ] Training load calculations use deduplicated data (no double-counting)
- [ ] Dedup runs automatically on each sync without user intervention

## Out of Scope

- Deduplication within a single source (assume each source has unique
  activities)
- Merging partial data from multiple sources into one enriched activity
  (future enhancement)
- Historical re-dedup of all existing data on first enable (process going
  forward only)

## Technical Context

- Matching algorithm uses: `|start_time_a - start_time_b| ≤ 5min` AND
  `sport_type_a == sport_type_b` AND `|duration_a - duration_b| / max(a,b) ≤ 0.10`
- Source richness scoring: count of non-null fields (GPS points, HR samples,
  elevation, power, cadence)
- Dedup engine lives in `packages/engine/src/dedup.ts`
- Merge logic in `packages/api/` handles the database operations
- Requires at least one additional platform integration (Strava) to be useful
