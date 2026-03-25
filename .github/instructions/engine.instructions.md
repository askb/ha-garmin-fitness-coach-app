<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

---
applyTo: "packages/engine/**"
---

# Engine Package Instructions

## Pure TypeScript Rules (NON-NEGOTIABLE)

- This package has ZERO external dependencies — keep it that way
- No I/O operations (no fetch, no fs, no database calls)
- No side effects — all functions must be pure
- Every exported function must include JSDoc with academic citation

## Sport Science Citations

Every calculation function MUST reference its source:

```typescript
/**
 * Calculate Training Stress Score (TRIMP) using Banister's model.
 *
 * @see Banister, E.W. (1991). Modeling elite athletic performance.
 *      Physiological Testing of the High-Performance Athlete, 403-424.
 */
export function calculateTRIMP(duration: number, hrReserve: number): number {
```

## Testing Requirements

- Location: `src/__tests__/`
- Runner: Vitest
- Every formula must have tests validating against published reference values
- Run: `pnpm --filter @acme/engine test`

## Key Formulas

- TRIMP (Banister 1991): Training impulse
- ACWR (Hulin 2016): Acute-to-chronic workload ratio
- CTL/ATL/TSB (Banister 1975): Fitness-fatigue model
- Readiness (Buchheit 2014): z-score based daily readiness
- VO2max estimation, race predictions (Riegel model)
