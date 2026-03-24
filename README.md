# GarminCoach — AI Fitness Coaching App

AI-powered sport scientist that turns Garmin data into actionable coaching,
training analysis, and recovery optimization.

## Architecture

```mermaid
graph TD
    subgraph "GarminCoach App (Next.js Monorepo)"
        User([User / Browser])
        NextJS["Next.js 16<br/>Turbopack"]
        tRPC["tRPC API<br/>20 routers · ~150 endpoints"]
        Drizzle["Drizzle ORM"]
        Engine["Engine<br/>Pure TS computation"]
        AICtx["AI Context Builder<br/>10 structured sections"]
        LLM["Ollama / OpenAI"]
    end

    subgraph "GarminCoach Addon (HA)"
        Sync["garmin-sync.py"]
        Compute["metrics-compute.py"]
        Notify["ha-notify.py"]
        GarminAPI["Garmin Connect API"]
        HAAPI["HA REST API<br/>7 sensors"]
    end

    PG[("PostgreSQL 16")]

    User --> NextJS
    NextJS --> tRPC
    tRPC --> Drizzle
    tRPC --> Engine
    tRPC --> AICtx
    AICtx --> LLM
    Drizzle --> PG

    GarminAPI --> Sync
    Sync --> PG
    PG --> Compute
    Compute --> PG
    PG --> Notify
    Notify --> HAAPI
```

## Tech Stack

- **Framework:** Next.js 16 (Turbopack)
- **Database:** PostgreSQL 16 + Drizzle ORM
- **API:** tRPC v11 with React Query
- **AI:** Ollama / OpenAI for coaching chat
- **Monorepo:** pnpm + Turborepo
- **UI:** Tailwind CSS v4 + shadcn/ui
- **Auth:** Better Auth

## Packages

| Package | Purpose |
|---------|---------|
| `apps/nextjs` | Next.js web application |
| `packages/api` | tRPC routers + AI context builder |
| `packages/db` | Drizzle schema + migrations (22 tables) |
| `packages/engine` | Pure TS computation (readiness, strain, baselines, anomalies, correlations) |
| `packages/garmin` | Garmin Connect API client |
| `packages/auth` | Better Auth configuration |
| `packages/validators` | Shared Zod schemas |
| `packages/ui` | shadcn/ui component library |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — readiness score, today's workout, recent activities |
| `/training` | PMC chart (CTL/ATL/TSB), ACWR gauge, risk zones |
| `/fitness` | VDOT, race predictions with confidence intervals |
| `/activities/[id]` | Activity detail — laps, efficiency, RPE, zone distribution |
| `/insights` | Proactive AI insight cards (6-rule engine) |
| `/journal` | Whoop-style daily check-in (body feel, inputs, cycle) |
| `/interventions` | Recovery intervention log with effectiveness ratings |
| `/sleep` | Sleep analysis, debt tracking, stage breakdown |
| `/trends` | 6+ year multi-metric overlay charts |
| `/coach` | AI coaching chat (sport scientist, psychologist, nutritionist, recovery) |
| `/power` | Critical power curve, power-duration chart |
| `/validation` | Reference measurement comparison |
| `/export` | CSV/JSON data export |
| `/team` | Multi-athlete profile switcher |
| `/correlations` | Metric correlation analysis |
| `/zones` | HR zone distribution + Seiler polarization |

## Database Schema (22 tables)

Key tables: `profile`, `daily_metric`, `activity`, `readiness_score`,
`journal_entry`, `session_report`, `intervention`, `advanced_metric`,
`athlete_baseline`, `ai_insight`, `correlation_result`, `race_prediction`,
`vo2max_estimate`, `training_status`, `weekly_plan`, `daily_workout`,
`workout_time_series`, `data_quality_log`, `reference_measurement`,
`audit_log`, `chat_message`, `post`.

## Engine Modules

| Module | Computes |
|--------|----------|
| `readiness` | Daily score (0–100) from HRV, sleep, load, RHR, stress via z-scores |
| `strain` | TRIMP-based training load with sex-specific constants |
| `baselines` | 30-day EMA + rolling SD for z-score transformations |
| `anomalies` | HRV crashes, sleep deficiency, overtraining signals |
| `vo2max` | ACSM / Uth / Cooper estimates + Riegel race predictions |
| `training-status` | Productive, maintaining, detraining, overreaching, peaking, recovery |
| `sleep-coach` | Debt tracking, extension recommendations |
| `correlations` | Pearson coefficients between metrics and journal tags |
| `trends` | Rolling averages (30/90/180/365d) + linear regression |
| `coaching` | Weekly plan generation from templates |
| `running-form` | Running form metrics and analysis |

## AI Context Pipeline

The AI coaching chat includes 10 structured context sections injected into
every prompt:

1. Athlete Profile (age, weight, sport, goals, thresholds)
2. Training Load (CTL / ATL / TSB / ACWR)
3. Recent Activities (last 7 days)
4. Zone Distribution (HR zones, polarization)
5. Sleep (stages, quality, debt)
6. Readiness & Recovery (score, confidence, contributing factors)
7. Journal (7-day history — body feel, inputs, cycle)
8. Interventions (recent 10 with effectiveness ratings)
9. Advanced Load Metrics (ramp rate, monotony, strain)
10. Personal Baselines (z-scores vs 30-day norms)

## Sport Science Methodology & Accuracy

Every metric is computed from **published, peer-reviewed formulas**. The
accuracy reference tests (`accuracy-reference.test.ts`) verify against
known values from the original papers.

### Strain vs Stress — Two Different Metrics

| Metric | What It Measures | Scale | Formula | Reference |
|--------|-----------------|-------|---------|-----------|
| **Strain** | Activity cardiovascular load | 0–21 | TRIMP → exponential saturation | Banister (1991) |
| **Stress** | Daily HRV-based body stress | 0–100 | Garmin proprietary (from watch) | Garmin HRV API |

**Strain** is per-workout intensity derived from HR zones (like WHOOP Strain).
**Stress** is all-day autonomic nervous system load (Garmin-specific).

### How We Compare to Garmin / WHOOP

| Chart | Our Method | Garmin Shows | WHOOP Shows | Accuracy Notes |
|-------|-----------|--------------|-------------|----------------|
| **Training Strain** | TRIMP × exponential curve (0–21) | Training Effect / Load | Day Strain (0–21) | Same TRIMP basis as WHOOP; our curve uses `21×(1-e^(-TRIMP/250))`. WHOOP uses proprietary weighting but same HR-zone foundation. ±1–2 points vs WHOOP. |
| **Body Stress** | Direct from Garmin API (`avgStressLevel`) | Stress Widget (0–100) | N/A (no equivalent) | **Identical** to Garmin — we read the same value your watch displays. |
| **ACWR** | 7d avg / 28d avg of strain scores | N/A (not shown) | N/A | Hulin et al. (2016). Standard sports science formula. |
| **Readiness** | Weighted z-score: HRV 35%, sleep 25%, load 20%, RHR 10%, stress 10% | Morning Report / Body Battery | Recovery Score | Different from both — ours is transparent and configurable. Garmin/WHOOP use proprietary ML. |
| **VO2max** | Uth formula: 15.3 × (maxHR / restHR) | Garmin VO2max (Firstbeat) | N/A | Uth et al. (2004). ±3–5 mL/kg/min vs lab test. Garmin uses Firstbeat (proprietary, more accurate with GPS pace). |
| **Race Predictions** | Riegel model: T₂ = T₁ × (D₂/D₁)^1.06 | Race Predictor | N/A | Riegel (1981). Classic model, ±2–5% for trained runners. |
| **Sleep Score** | Weighted: duration 40%, efficiency 25%, deep 20%, REM 15% | Sleep Score | Sleep Performance | Similar components, different weights. Garmin/WHOOP use Firstbeat/ML. |
| **HRV Trend** | Direct from Garmin API | HRV Status | HRV (RMSSD) | **Identical** to Garmin — same nightly HRV value. |
| **Recovery Time** | Composite: strain × 6h base, adjusted for sleep, HRV, RHR | Recovery Time Advisor | Recovery hours | Ours is simpler; Garmin uses Firstbeat model with VO2max input. ±4–8h difference possible. |

### Key Differences from Garmin Connect

1. **Garmin uses Firstbeat Analytics** (proprietary ML) for VO2max, Training
   Effect, and Recovery Advisor. Our formulas are **open, reproducible, and
   peer-reviewed** but may differ by ±5–10% on individual metrics.
2. **Stress is identical** — we read the same `avgStressLevel` your watch computes.
3. **HRV is identical** — same nightly reading from the Garmin API.
4. **Training Load** differs — Garmin shows "7-day load" in arbitrary units;
   we show TRIMP-based strain (0–21, WHOOP-compatible).

### Key Differences from WHOOP

1. **Strain scale is the same** (0–21) but computed from Banister TRIMP, not
   WHOOP's proprietary algorithm. Expect ±1–2 points difference.
2. **Recovery** — WHOOP uses HRV + RHR + sleep via ML. Ours uses z-score
   weighted formula. Directionally similar but numbers won't match exactly.
3. **Sleep** — WHOOP uses accelerometer + HR. We use Garmin's sleep staging
   (also accelerometer + HR). Similar accuracy.

### Published References

- Banister EW (1991) — TRIMP model for training impulse
- Hulin BT et al. (2016) — ACWR and injury risk thresholds
- Uth N et al. (2004) — VO2max estimation from HR ratio
- Cooper KH (1968) — 12-minute run VO2max test
- Riegel PS (1981) — Race time prediction model
- Hausswirth C & Mujika I (2013) — Recovery in sport
- Hirshkowitz M et al. (2015) — Sleep duration recommendations
- Moore IS (2016) — Running form biomechanics

## Testing

- **239 tests** across 23 files (engine, API, Next.js unit + E2E)
- Engine: readiness, strain, baselines, anomalies, coaching, validation
- API: profile, readiness, trends, workout routers
- Next.js: PMC chart accuracy, export utils, athlete fixtures
- E2E: navigation, onboarding, settings, trends (Playwright)
- **CI:** GitHub Actions — lint + typecheck + Jest + E2E on every PR

## Development

```bash
# Prerequisites: Node 20+, pnpm 9+, Docker (for Postgres + Redis)

# Start backing services
docker compose up -d

# Install dependencies
pnpm install

# Push schema to database
pnpm db:push

# Start dev server
pnpm dev
```

## License

MIT
