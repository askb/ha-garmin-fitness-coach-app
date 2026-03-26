# 003: Garmin Weight Sync

## Status: Draft

## Problem Statement

Weight data exists in the Garmin Connect daily stats API response but is not
being extracted or stored. This means BMI calculations are missing or use stale
manual entries, and the user profile doesn't reflect current weight from their
Garmin scale or manual Garmin Connect entries.

## Requirements

- [ ] Extract weight from Garmin daily stats during sync
- [ ] Store weight history in the database with timestamps
- [ ] Update the user profile to display current weight
- [ ] Recalculate BMI when new weight data arrives
- [ ] Handle missing weight data gracefully (not all daily stats include weight)

## Acceptance Criteria

- [ ] After a sync that includes weight data, the latest weight appears on the
      profile page
- [ ] BMI is recalculated using the latest synced weight
- [ ] Weight history is stored (not just the latest value)
- [ ] Days without weight data do not overwrite existing weight records
- [ ] Weight values are stored in a consistent unit (kg) with display conversion

## Out of Scope

- Manual weight entry in the app UI (future enhancement)
- Weight trend analysis or graphing (future enhancement)
- Syncing weight to Garmin (read-only)

## Technical Context

- This is cross-repo: the HA addon's `garmin-sync.py` handles extraction from
  the Garmin API, and the app stores/displays the data
- The spec lives in the app repo since most implementation work is here
- The database schema needs a weight column or table
- BMI calculation depends on height (already in profile) and weight
