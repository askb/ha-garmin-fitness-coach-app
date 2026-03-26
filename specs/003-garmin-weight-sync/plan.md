# 003: Garmin Weight Sync — Implementation Plan

## Approach

Add weight extraction to the addon sync script, extend the database schema to
store weight history, and update the profile page to display current weight and
BMI. This is a vertical slice across the sync pipeline.

## Architecture Decisions

- Store weight as a time-series (date + value in kg) rather than a single
  profile field: enables future trend analysis
- Use kg as the canonical unit with display-time conversion: avoids rounding
  errors from repeated conversions
- BMI recalculation is triggered on weight insert, not on page load: keeps reads
  fast

## Components Affected

- Addon `garmin-sync.py` — add weight field extraction from daily stats payload
- `packages/db` schema — add weight history table/column with migration
- `packages/api/src/router/` — add or extend endpoint to serve weight data
- Profile page component — display latest weight and calculated BMI

## Dependencies

- Access to Garmin daily stats API response format (verify weight field name)
- Database migration tooling (Drizzle or Prisma, whichever the project uses)
- Height value must already exist in user profile for BMI calculation
