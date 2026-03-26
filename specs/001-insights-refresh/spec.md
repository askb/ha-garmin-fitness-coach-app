# 001: Insights Refresh

## Status: Draft

## Problem Statement

When Garmin data syncs, the Insights page (`/insights`) still shows stale data
until the user manually reloads the page. This creates a confusing experience
where a sync completes successfully but the UI doesn't reflect the new data.

## Requirements

- [ ] Auto-invalidate tRPC queries on the Insights page after a sync completes
- [ ] Show a loading/skeleton state while fresh data is being fetched
- [ ] Preserve scroll position during refresh
- [ ] No full-page reload — use client-side query invalidation only

## Acceptance Criteria

- [ ] After a Garmin sync completes, the Insights page updates within 2 seconds
      without a manual refresh
- [ ] A loading skeleton is visible during the data re-fetch
- [ ] No flash of stale data between sync completion and fresh data display
- [ ] Existing manual refresh (pull-to-refresh / F5) still works

## Out of Scope

- Modifying the Garmin sync process itself
- Real-time push updates via WebSockets (polling/invalidation is sufficient)
- Offline caching strategy changes

## Technical Context

- The app uses tRPC for API calls with React Query under the hood
- Sync status is likely available via a tRPC subscription or polling endpoint
- Key query routers live in `packages/api/src/router/analytics.ts`
- The Insights page components are in `apps/nextjs/src/app/insights/`
