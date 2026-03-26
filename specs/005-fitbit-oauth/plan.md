# 005: Fitbit OAuth — Implementation Plan

## Approach

Create a `packages/fitbit/` package following the same pattern established by
the Strava integration (spec 004). Focus on biometric data (sleep, HRV, HR,
SpO2) rather than activities, since that's where Fitbit adds the most value
alongside Garmin activity data.

## Architecture Decisions

- Follow the Strava package pattern: keeps integrations consistent and
  reduces cognitive overhead
- Use OAuth2 with PKCE: required by Fitbit's current API and more secure
  than basic authorization code flow
- Focus on biometrics first, activities later: Fitbit's biometric data
  (sleep stages, HRV, SpO2) adds unique value that Garmin may not provide
  at the same granularity
- Scope requests to minimum needed: only request sleep, heartrate, oxygen
  saturation, and profile scopes

## Components Affected

- New `packages/fitbit/` — OAuth client with PKCE, API wrapper, data mappers
- `packages/db` schema — extend OAuth token storage, add source tracking to
  biometric tables
- `apps/nextjs/src/app/settings/` — add Fitbit connect/disconnect UI
- `packages/api/src/router/` — add Fitbit OAuth callback and sync endpoints
- `packages/engine/` — ensure readiness engine accepts multi-source biometrics

## Dependencies

- Spec 004 (Strava OAuth) should be implemented first to establish the
  integration pattern
- Fitbit API application credentials (client ID)
- Understanding of Fitbit OAuth scopes and rate limits
