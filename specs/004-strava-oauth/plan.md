# 004: Strava OAuth — Implementation Plan

## Approach

Create a self-contained `packages/strava/` package that handles OAuth2 flow,
API communication, and data mapping. Integrate with the existing app via a
settings UI for account management and a sync service for data import.

## Architecture Decisions

- Separate package (`packages/strava/`): isolates Strava-specific logic, makes
  it testable independently, and follows the monorepo package pattern
- Use authorization code flow (not implicit): required by Strava API and more
  secure
- Store OAuth tokens encrypted in the database: refresh tokens are long-lived
  and sensitive
- Map Strava activities to the app's internal activity model: enables unified
  analysis regardless of data source

## Components Affected

- New `packages/strava/` — OAuth client, API wrapper, activity mapper
- `packages/db` schema — add OAuth token storage and source tracking on
  activities
- `apps/nextjs/src/app/settings/` — add Strava connect/disconnect UI
- `packages/api/src/router/` — add Strava OAuth callback and sync endpoints

## Dependencies

- Strava API application credentials (client ID and secret)
- Understanding of Strava API rate limits for sync scheduling
- Database migration for token storage and activity source field
