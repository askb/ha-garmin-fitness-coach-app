# 002: Notable Empty — Implementation Plan

## Approach

Debug the anomaly detection pipeline end-to-end: verify data input, threshold
logic, and rendering condition. The fix likely involves correcting threshold
calculations in `anomalies.ts` and/or fixing the conditional rendering in the
dashboard widget.

## Architecture Decisions

- Fix in place rather than rewrite: the anomaly detection architecture is sound,
  the bug is in the implementation details
- Add unit tests for threshold logic to prevent regressions
- Log anomaly detection results at debug level for future troubleshooting

## Components Affected

- `packages/engine/src/anomalies.ts` — fix threshold calculation and comparison
  logic
- `packages/api/src/router/analytics.ts` — verify data query returns sufficient
  historical data for anomaly detection
- Dashboard Notable Changes widget — fix rendering condition (may be checking
  wrong field or mishandling empty results)

## Dependencies

- Sufficient historical data in the database for meaningful comparisons
- Understanding of current threshold definitions (need to inspect code)
