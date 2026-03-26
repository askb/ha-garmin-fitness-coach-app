# 001: Insights Refresh — Implementation Plan

## Approach

Hook into the sync-completion event and use tRPC's `queryClient.invalidateQueries`
to automatically re-fetch analytics data on the Insights page. Add a skeleton
loading state so users see a smooth transition instead of stale-then-fresh data.

## Architecture Decisions

- Use tRPC query invalidation (not full page reload): keeps client state intact
  and is the idiomatic React Query approach
- Listen for sync completion via existing tRPC endpoint rather than adding
  WebSocket infrastructure
- Use skeleton components for loading state: matches existing UI patterns

## Components Affected

- `apps/nextjs/src/app/insights/` — add invalidation hook and loading skeletons
- `packages/api/src/router/analytics.ts` — ensure cache headers allow
  invalidation; may need a sync-status query

## Dependencies

- Existing tRPC query infrastructure (React Query)
- Sync completion signal (verify how sync status is currently exposed)
