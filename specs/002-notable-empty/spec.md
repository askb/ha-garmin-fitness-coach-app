# 002: Notable Empty

## Status: Draft

## Problem Statement

The Notable Changes widget on the dashboard shows "No notable changes" even when
metrics have significant shifts (e.g., a large increase in resting heart rate or
a sudden drop in sleep score). The anomaly detection logic is either using
incorrect thresholds or not receiving the right data.

## Requirements

- [ ] Fix anomaly detection logic to correctly identify notable metric changes
- [ ] Ensure the data pipeline delivers sufficient historical context for
      comparison
- [ ] Display detected anomalies in the Notable Changes widget when they exist
- [ ] Continue showing "No notable changes" only when metrics are genuinely stable

## Acceptance Criteria

- [ ] When a metric changes by more than the defined threshold (e.g., ±1 std
      deviation), it appears in Notable Changes
- [ ] Widget correctly renders at least: metric name, direction of change,
      and magnitude
- [ ] Widget shows "No notable changes" only when no metrics exceed thresholds
- [ ] Anomaly detection works for all tracked metrics (HR, HRV, sleep, load)

## Out of Scope

- Adding new anomaly detection algorithms (fix existing logic first)
- User-configurable thresholds (future enhancement)
- Push notifications for anomalies

## Technical Context

- Anomaly detection lives in `packages/engine/src/anomalies.ts`
- Data is served via `packages/api/src/router/analytics.ts`
- The dashboard widget renders the results; the rendering condition may also
  have a bug (e.g., checking wrong field or empty-array logic)
