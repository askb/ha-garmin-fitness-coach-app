# 004: Strava OAuth

## Status: Draft

## Problem Statement

Users who track activities on Strava (in addition to or instead of Garmin)
cannot import those activities into the fitness coach. This limits the app to
Garmin-only users and prevents a unified view of training data.

## Requirements

- [ ] Implement Strava OAuth2 authorization flow (connect/disconnect)
- [ ] Sync activities from Strava including GPS and heart rate data
- [ ] Import activity metadata: type, duration, distance, elevation, timestamps
- [ ] Provide a settings UI for connecting and disconnecting the Strava account
- [ ] Support incremental sync (only fetch new activities since last sync)
- [ ] Handle token refresh automatically

## Acceptance Criteria

- [ ] User can connect their Strava account via OAuth2 from the settings page
- [ ] After connecting, historical activities are imported (configurable lookback)
- [ ] New activities sync automatically on a schedule
- [ ] User can disconnect Strava and optionally remove imported data
- [ ] GPS tracks and heart rate data are available for imported activities
- [ ] OAuth tokens are securely stored and automatically refreshed

## Out of Scope

- Writing data back to Strava
- Strava segment analysis
- Social features (clubs, kudos)
- Real-time activity streaming

## Technical Context

- Strava API uses OAuth2 with authorization code flow
- Rate limits: 100 requests per 15 minutes, 1000 per day
- Activity streams endpoint provides GPS/HR data per activity
- A new `packages/strava/` package will encapsulate all Strava logic
- This is an independent feature with no dependency on other pending work
