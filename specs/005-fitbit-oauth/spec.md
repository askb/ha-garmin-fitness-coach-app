# 005: Fitbit OAuth

## Status: Draft

## Problem Statement

Fitbit users cannot import their health data (sleep, HRV, heart rate zones,
SpO2) into the fitness coach. Fitbit provides rich biometric data that would
enhance training readiness and recovery analysis.

## Requirements

- [ ] Implement Fitbit OAuth2 authorization flow (connect/disconnect)
- [ ] Sync sleep data including sleep stages and duration
- [ ] Sync HRV data (daily and intraday where available)
- [ ] Sync heart rate zones and resting heart rate
- [ ] Sync SpO2 (blood oxygen) data
- [ ] Provide settings UI for connecting and disconnecting Fitbit
- [ ] Support incremental sync
- [ ] Handle token refresh automatically

## Acceptance Criteria

- [ ] User can connect their Fitbit account via OAuth2 from settings
- [ ] Sleep, HRV, HR zones, and SpO2 data import after connecting
- [ ] New data syncs automatically on a schedule
- [ ] User can disconnect Fitbit and optionally remove imported data
- [ ] Imported biometric data is available to the readiness engine
- [ ] OAuth tokens are securely stored and refreshed

## Out of Scope

- Fitbit activity/exercise import (focus on biometrics first)
- Fitbit food logging or water intake
- Writing data back to Fitbit
- Fitbit Premium features

## Technical Context

- Fitbit API uses OAuth2 with PKCE (Authorization Code Grant with PKCE)
- Rate limit: 150 requests per hour per user
- Sleep, HRV, and SpO2 endpoints require specific OAuth scopes
- Implementation pattern should mirror `packages/strava/` (do Strava first)
- A new `packages/fitbit/` package will encapsulate all Fitbit logic
