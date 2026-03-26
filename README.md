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

## API Reference

All API calls go through tRPC v11. Every procedure is `protectedProcedure`
(requires an authenticated session) unless noted as `publicProcedure`.
Call convention: `trpc.<router>.<procedure>(input)`.

---

### `activity` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `activity.list` | query | List activities for the past N days |
| `activity.getDetail` | query | Get full activity details with running-form analysis |
| `activity.getRecent` | query | Get the 5 most recent activities |

#### `activity.list`

**Input**
```ts
{
  days?: number       // 1–365, default 30
  sportType?: string  // e.g. "running" — optional filter
}
```

**Output** – array of activity rows (up to 50):
```ts
Array<{
  id: string
  sportType: string
  subType: string | null
  startedAt: Date
  durationMinutes: number
  distanceMeters: number | null
  avgHr: number | null
  strainScore: number | null
  vo2maxEstimate: number | null
  avgPaceSecPerKm: number | null
  calories: number | null
  aerobicTE: number | null
  anaerobicTE: number | null
}>
```

**Example**
```ts
// Request
const activities = await trpc.activity.list.query({ days: 14, sportType: "running" });

// Response (abbreviated)
[
  {
    id: "clx1234",
    sportType: "running",
    startedAt: "2025-03-20T07:00:00Z",
    durationMinutes: 45.2,
    distanceMeters: 8500,
    avgHr: 148,
    strainScore: 9.4
  }
]
```

#### `activity.getDetail`

**Input**
```ts
{ id: string }
```

**Output** – full activity row plus `runningFormScore` (object or `null`):
```ts
{
  /* all Activity columns */
  runningFormScore: {
    score: number             // 0–100
    cadenceScore: number
    groundContactScore: number
    oscillationScore: number
    strideScore: number
    balanceScore: number
    recommendations: string[]
  } | null
}
```

#### `activity.getRecent`

**Input** – none

**Output** – array of the 5 most recent activities (subset of columns):
```ts
Array<{
  id: string
  sportType: string
  subType: string | null
  startedAt: Date
  durationMinutes: number
  distanceMeters: number | null
  avgHr: number | null
  strainScore: number | null
  calories: number | null
}>
```

---

### `analytics` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `analytics.getTrainingLoads` | query | CTL / ATL / TSB / ACWR from last 42 days |
| `analytics.getTrainingStatus` | query | Classify training phase (productive, overreaching, …) |
| `analytics.getVO2maxHistory` | query | VO2max estimates over time with trend |
| `analytics.getRacePredictions` | query | Riegel race-time predictions from latest VO2max |
| `analytics.getCorrelations` | query | Pearson correlations between daily metrics |
| `analytics.getRunningForm` | query | Running form analysis for a specific or latest run |
| `analytics.getRecoveryTime` | query | Estimated hours until full recovery |

#### `analytics.getTrainingLoads`

**Input** – none

**Output**
```ts
{
  ctl: number        // Chronic Training Load (fitness)
  atl: number        // Acute Training Load (fatigue)
  tsb: number        // Training Stress Balance (form = CTL - ATL)
  acwr: number       // Acute:Chronic Workload Ratio (7d / 28d average)
  acwrEwma: number   // EWMA-smoothed ACWR
  loadFocus: string  // "aerobic" | "anaerobic" | "mixed" | "recovery"
  rampRate: number   // % week-over-week change in load
}
```

**Example**
```ts
const loads = await trpc.analytics.getTrainingLoads.query();
// { ctl: 42.1, atl: 48.3, tsb: -6.2, acwr: 1.15, acwrEwma: 1.18,
//   loadFocus: "aerobic", rampRate: 4.2 }
```

#### `analytics.getTrainingStatus`

**Input** – none

**Output** – training status classification:
```ts
{
  status: "productive" | "maintaining" | "detraining" | "overreaching" | "peaking" | "recovery"
  confidence: number
  reason: string
}
```

#### `analytics.getVO2maxHistory`

**Input**
```ts
{ days?: number }  // 1–730, default 365
```

**Output**
```ts
{
  estimates: Array<{
    id: string
    date: string          // "YYYY-MM-DD"
    value: number         // mL/kg/min
    source: string        // "uth_method" | "running_pace_hr" | etc.
    sport: string
  }>
  trend: {
    slope: number         // mL/kg/min per week
    direction: "improving" | "stable" | "declining"
    r2: number
  }
}
```

#### `analytics.getRacePredictions`

**Input** – none

**Output** – race time predictions from latest running VO2max (`null` if no data):
```ts
{
  fiveK:       { seconds: number; formatted: string }
  tenK:        { seconds: number; formatted: string }
  halfMarathon: { seconds: number; formatted: string }
  marathon:    { seconds: number; formatted: string }
} | null
```

#### `analytics.getCorrelations`

**Input**
```ts
{ period?: "30d" | "90d" | "180d" }  // default "90d"
```

**Output** – array of Pearson correlation pairs:
```ts
Array<{
  metricA: string
  metricB: string
  r: number           // –1 to 1
  pValue: number
  n: number
  interpretation: string
}>
```

#### `analytics.getRunningForm`

**Input**
```ts
{ activityId?: string }  // omit for latest running activity
```

**Output** – running form analysis object (or `null`):
```ts
{
  score: number
  cadenceScore: number
  groundContactScore: number
  oscillationScore: number
  strideScore: number
  balanceScore: number
  recommendations: string[]
} | null
```

#### `analytics.getRecoveryTime`

**Input** – none

**Output**
```ts
{
  hoursUntilRecovered: number
  readinessNow: number          // 0–100
  contributingFactors: string[]
}
```

---

### `chat` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `chat.getHistory` | query | Fetch recent chat messages |
| `chat.sendMessage` | mutation | Send a message to the AI coaching agent |
| `chat.clearHistory` | mutation | Delete all chat messages for the user |

#### `chat.getHistory`

**Input**
```ts
{ limit?: number }  // 1–200, default 50
```

**Output** – chronological array of chat messages:
```ts
Array<{
  id: string
  userId: string
  role: "user" | "assistant"
  content: string
  context: { agent: string; agentLabel?: string }
  createdAt: Date
}>
```

#### `chat.sendMessage`

**Input**
```ts
{
  content: string   // 1–2000 characters
  agent?: "sport-scientist" | "psychologist" | "nutritionist" | "recovery"
  // default "sport-scientist"
}
```

**Output** – the saved assistant message:
```ts
{
  id: string
  userId: string
  role: "assistant"
  content: string   // AI response + medical disclaimer
  context: { agent: string; agentLabel: string }
  createdAt: Date
  agent: string
}
```

**Example**
```ts
const reply = await trpc.chat.sendMessage.mutate({
  content: "Should I run a hard interval session today?",
  agent: "sport-scientist"
});
// reply.content → "Given your HRV of 52ms (below your 68ms baseline) ..."
```

#### `chat.clearHistory`

**Input** – none

**Output**
```ts
{ success: true }
```

---

### `journal` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `journal.list` | query | List journal entries between two dates |
| `journal.getByDate` | query | Get a single journal entry by date |
| `journal.upsert` | mutation | Create or update a journal entry |
| `journal.delete` | mutation | Delete a journal entry by date |

#### `journal.list`

**Input**
```ts
{
  startDate: string  // "YYYY-MM-DD"
  endDate:   string  // "YYYY-MM-DD"
}
```

**Output** – array of `JournalEntry` rows ordered by date descending.

#### `journal.getByDate`

**Input**
```ts
{ date: string }  // "YYYY-MM-DD"
```

**Output** – single `JournalEntry` or `null`.

#### `journal.upsert`

**Input**
```ts
{
  date:             string
  tags:             Record<string, boolean | number | string>
  notes?:           string
  sorenessScore?:   number  // int 1–10
  sorenessRegions?: string[]
  moodScore?:       number  // int 1–10
  caffeineAmountMg?: number // int ≥ 0
  caffeineTime?:    string
  alcoholDrinks?:   number  // int ≥ 0
  napMinutes?:      number  // int ≥ 0
  medications?:     string[]
  menstrualPhase?:  "follicular" | "ovulation" | "luteal" | "menstrual" | null
}
```

**Output** – the upserted `JournalEntry` row.

**Example**
```ts
await trpc.journal.upsert.mutate({
  date: "2025-03-20",
  tags: { highStress: true, alcohol: false },
  moodScore: 7,
  sorenessScore: 4,
  sorenessRegions: ["quads", "calves"]
});
```

#### `journal.delete`

**Input**
```ts
{ date: string }  // "YYYY-MM-DD"
```

**Output**
```ts
{ success: true }
```

---

### `profile` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `profile.get` | query | Get the current user's profile |
| `profile.upsert` | mutation | Create or update the full profile |
| `profile.updateSportsAndGoals` | mutation | Update primary sports and goal list |
| `profile.updateAvailability` | mutation | Update training availability |
| `profile.updateHealth` | mutation | Update health conditions and injuries |

#### `profile.get`

**Input** – none

**Output** – `Profile` row or `null` if not set up yet.

#### `profile.upsert`

**Input** – `CreateProfileSchema` (Zod):
```ts
{
  name?:              string
  age?:               number
  sex?:               "male" | "female" | "other"
  weightKg?:          number
  heightCm?:          number
  restingHr?:         number
  maxHr?:             number
  vo2max?:            number
  primarySports?:     string[]
  goals?:             Array<{ sport: string; goalType: string; target?: string }>
  weeklyDays?:        string[]
  minutesPerDay?:     number
  experienceLevel?:   "beginner" | "intermediate" | "advanced" | "elite"
  /* … all other Profile columns */
}
```

**Output** – the created or updated `Profile` row.

#### `profile.updateSportsAndGoals`

**Input**
```ts
{
  primarySports: string[]
  goals: Array<{
    sport:    string
    goalType: string
    target?:  string
  }>
}
```

**Output** – void (update only).

#### `profile.updateAvailability`

**Input**
```ts
{
  weeklyDays:     string[]   // e.g. ["Mon","Tue","Thu","Sat"]
  minutesPerDay:  number     // 15–180
}
```

**Output** – void.

#### `profile.updateHealth`

**Input**
```ts
{
  healthConditions?: string[]
  currentInjuries?: Array<{
    bodyPart:  string
    severity:  "mild" | "moderate" | "severe"
    since?:    string
    notes?:    string
  }>
  medications?: string
  allergies?:   string
}
```

**Output** – void.

---

### `readiness` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `readiness.getToday` | query | Compute (or fetch cached) today's readiness score |
| `readiness.getHistory` | query | Historical readiness scores with confidence |
| `readiness.getComponents` | query | Score components for a specific date |
| `readiness.getAnomalies` | query | Detected anomalies from last 7 days |

#### `readiness.getToday`

**Input** – none

**Output**
```ts
{
  score:             number          // 0–100
  zone:              "low" | "moderate" | "high" | "peak"
  color:             string          // hex color for UI
  explanation:       string
  components: {
    hrv:             number
    sleepQuantity:   number
    sleepQuality:    number
    restingHr:       number
    trainingLoad:    number
    stress:          number
  }
  confidence:        number          // 0–1
  dataQuality: {
    hrv:             "good" | "missing" | "stale"
    sleep:           "good" | "missing" | "stale"
    restingHr:       "good" | "missing" | "stale"
    trainingLoad:    "good" | "missing" | "stale"
  }
  actionSuggestion:  string
  doNotOverinterpret: boolean
} | null
```

**Example**
```ts
const r = await trpc.readiness.getToday.query();
// { score: 74, zone: "moderate", explanation: "HRV slightly below baseline...",
//   confidence: 0.85, actionSuggestion: "Stick to planned training..." }
```

#### `readiness.getHistory`

**Input**
```ts
{ days?: number }  // 1–90, default 28
```

**Output** – array of `ReadinessScore` rows each with `confidence: number`.

#### `readiness.getComponents`

**Input**
```ts
{ date: string }  // "YYYY-MM-DD"
```

**Output** – single `ReadinessScore` row or `undefined`.

#### `readiness.getAnomalies`

**Input** – none

**Output** – anomaly detection results:
```ts
Array<{
  type: "hrv_crash" | "sleep_deficiency" | "overtraining" | string
  severity: "low" | "medium" | "high"
  message: string
  date: string
}>
```

---

### `sleep` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `sleep.getCoach` | query | Personalized sleep coach recommendations |
| `sleep.getHistory` | query | Sleep history for the past N days |
| `sleep.getStages` | query | Nightly stage breakdown for the past N days |

#### `sleep.getCoach`

**Input** – none

**Output** – sleep coach result:
```ts
{
  recommendation:      string
  targetBedtime:       string | null
  targetWakeTime:      string | null
  sleepNeedMinutes:    number
  sleepDebtMinutes:    number
  extensionAdvice:     string
  qualityTips:         string[]
}
```

#### `sleep.getHistory`

**Input**
```ts
{ days?: number }  // 1–90, default 28
```

**Output**
```ts
Array<{
  date:               string
  totalSleepMinutes:  number | null
  deepSleepMinutes:   number | null
  remSleepMinutes:    number | null
  lightSleepMinutes:  number | null
  awakeMinutes:       number | null
  sleepScore:         number | null
  sleepStartTime:     number | null
  sleepEndTime:       number | null
  sleepNeedMinutes:   number | null
  sleepDebt:          number | null
}>
```

#### `sleep.getStages`

**Input**
```ts
{ days?: number }  // 1–90, default 7
```

**Output**
```ts
Array<{
  date:             string
  deepMinutes:      number | null
  remMinutes:       number | null
  lightMinutes:     number | null
  awakeMinutes:     number | null
  sleepNeedMinutes: number | null
}>
```

---

### `trends` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `trends.getSummary` | query | Avg readiness, sleep, HRV over 7d or 28d |
| `trends.getChart` | query | Time-series data for a single metric |
| `trends.getLongTermTrend` | query | Statistical trend analysis (slope, direction) |
| `trends.getRollingAverages` | query | Rolling-window averages |
| `trends.getNotableChanges` | query | Significant inflection points |
| `trends.getMultiMetricChart` | query | Multi-metric time series in one call |

Metric enum used by several procedures:
`"readiness" | "sleep" | "hrv" | "restingHr" | "strain" | "stress"`

#### `trends.getSummary`

**Input**
```ts
{ period?: "7d" | "28d" }  // default "7d"
```

**Output**
```ts
{
  period:            string
  avgReadiness:      number | null
  avgSleepMinutes:   number | null
  avgHrv:            number | null
  totalDays:         number
  readinessScores:   number
}
```

#### `trends.getChart`

**Input**
```ts
{
  metric: "readiness" | "sleep" | "hrv" | "strain" | "stress"
  days?:  number  // 1–90, default 28
}
```

**Output**
```ts
Array<{ date: string; value: number | null }>
```

#### `trends.getLongTermTrend`

**Input**
```ts
{
  metric: "readiness" | "sleep" | "hrv" | "restingHr" | "strain" | "stress"
  period: "30d" | "90d" | "180d" | "365d"
}
```

**Output** – trend analysis object (or `null`):
```ts
{
  values:    Array<{ date: string; value: number }>
  slope:     number
  intercept: number
  r2:        number
  direction: "improving" | "stable" | "declining"
  summary:   string
} | null
```

#### `trends.getRollingAverages`

**Input**
```ts
{
  metric: string   // see metric enum above
  days:   number   // 1–365
  window?: number  // rolling window size, default 7
}
```

**Output**
```ts
Array<{ date: string; value: number }>
```

#### `trends.getNotableChanges`

**Input**
```ts
{
  metric:     string   // metric enum
  days:       number   // 1–365
  threshold?: number   // % change threshold, default 10
}
```

**Output**
```ts
Array<{
  date:         string
  value:        number
  changePercent: number
  direction:    "up" | "down"
}>
```

#### `trends.getMultiMetricChart`

**Input**
```ts
{
  metrics: Array<"readiness" | "sleep" | "hrv" | "restingHr" | "strain" | "stress">
  days:    number  // 1–365
}
```

**Output**
```ts
Record<string, Array<{ date: string; value: number }>>
// keys are the requested metric names
```

---

### `workout` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `workout.getToday` | query | Generate (or fetch cached) today's AI-recommended workout |
| `workout.getWeekPlan` | query | All workouts for the current week |
| `workout.getDetail` | query | Get one workout by ID |
| `workout.adjustDifficulty` | mutation | Bump today's workout harder or easier |

#### `workout.getToday`

**Input** – none

**Output** – `DailyWorkout` row or `null`:
```ts
{
  id:                string
  date:              string
  sportType:         string
  workoutType:       string
  title:             string
  description:       string | null
  targetDurationMin: number | null
  targetDurationMax: number | null
  targetHrZoneLow:   number | null
  targetHrZoneHigh:  number | null
  targetStrainLow:   number | null
  targetStrainHigh:  number | null
  structure:         object[]
  readinessZoneUsed: string
  explanation:       string | null
}
```

#### `workout.getWeekPlan`

**Input** – none

**Output** – array of `DailyWorkout` rows from Monday of the current week.

#### `workout.getDetail`

**Input**
```ts
{ id: string }
```

**Output** – single `DailyWorkout` row.

#### `workout.adjustDifficulty`

**Input**
```ts
{ direction: "harder" | "easier" }
```

**Output** – the updated workout recommendation object (or `null`).

**Example**
```ts
const adjusted = await trpc.workout.adjustDifficulty.mutate({ direction: "easier" });
// adjusted.workoutType → "recovery_run"
// adjusted.targetDurationMin → 25
```

---

### `intervention` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `intervention.list` | query | List recovery interventions |
| `intervention.create` | mutation | Log a new intervention |
| `intervention.update` | mutation | Update outcome notes / effectiveness |
| `intervention.delete` | mutation | Delete an intervention by ID |

Allowed `type` values:
`"reduced_load" | "extra_sleep" | "physio" | "nutrition_change" |
"deload_week" | "travel_recovery" | "ice_bath" | "compression" |
"massage" | "meditation" | "other"`

#### `intervention.list`

**Input**
```ts
{
  startDate?: string  // "YYYY-MM-DD", optional filter
  endDate?:   string  // "YYYY-MM-DD", optional filter
}
```

**Output** – array of `Intervention` rows (up to 50), newest first.

#### `intervention.create`

**Input**
```ts
{
  date:                string
  type:                string  // one of the allowed types above
  description?:        string
  outcomeNotes?:       string
  effectivenessRating?: number  // int 1–5
  linkedMetricDate?:   string
}
```

**Output** – the created `Intervention` row.

#### `intervention.update`

**Input**
```ts
{
  id:                  string
  outcomeNotes?:       string
  effectivenessRating?: number  // int 1–5
}
```

**Output** – the updated `Intervention` row.

#### `intervention.delete`

**Input**
```ts
{ id: string }
```

**Output**
```ts
{ success: true }
```

---

### `advancedMetrics` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `advancedMetrics.list` | query | List advanced load metrics over a date range |
| `advancedMetrics.getLatest` | query | Get the most recent advanced metrics row |

#### `advancedMetrics.list`

**Input**
```ts
{
  startDate?: string  // "YYYY-MM-DD"
  endDate?:   string  // "YYYY-MM-DD"
  days?:      number  // 7–365, default 90 (used when startDate is omitted)
}
```

**Output** – array of `AdvancedMetric` rows (up to 365), oldest first:
```ts
Array<{
  id: string
  date: string
  ctl: number | null
  atl: number | null
  tsb: number | null
  acwr: number | null
  rampRate: number | null
  monotony: number | null
  strain: number | null  // weekly strain sum
  /* … other computed columns */
}>
```

#### `advancedMetrics.getLatest`

**Input** – none

**Output** – single `AdvancedMetric` row or `null`.

---

### `zones` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `zones.getWeeklyZoneDistribution` | query | HR zone minutes aggregated by ISO week |
| `zones.getPolarizationIndex` | query | Seiler polarization index per week |
| `zones.getZoneTrends` | query | Zone percentage breakdown by calendar month |
| `zones.getEfficiencyTrend` | query | Efficiency index (speed / HR) over time |
| `zones.getActivityCalendar` | query | Activity heatmap data by day |
| `zones.getVolumeByWeek` | query | Training volume (minutes) by sport per week |
| `zones.getPeakPerformances` | query | Monthly personal bests for a given metric |

#### `zones.getWeeklyZoneDistribution`

**Input**
```ts
{
  sportType?: string   // optional filter
  days?:      number   // 1–730, default 365
}
```

**Output**
```ts
Array<{
  week:       string   // "YYYY-MM-DD" (Monday)
  z1: number; z2: number; z3: number; z4: number; z5: number  // minutes
  total:      number
  activities: number
}>
```

#### `zones.getPolarizationIndex`

**Input**
```ts
{ days?: number }  // 1–730, default 90
```

**Output**
```ts
Array<{
  week:               string
  easyPct:            number   // % in Z1+Z2
  moderatePct:        number   // % in Z3
  hardPct:            number   // % in Z4+Z5
  polarizationIndex:  number   // Seiler's PI = ln(1/Σpi²)
}>
```

#### `zones.getZoneTrends`

**Input**
```ts
{
  sportType?: string
  days?:      number  // 1–730, default 180
}
```

**Output**
```ts
Array<{
  month: string   // "YYYY-MM"
  z1Pct: number; z2Pct: number; z3Pct: number; z4Pct: number; z5Pct: number
}>
```

#### `zones.getEfficiencyTrend`

**Input**
```ts
{
  sportType?: string  // default "running"
  days?:      number  // 1–730, default 365
}
```

**Output**
```ts
Array<{
  date:             string
  avgHr:            number
  paceSecPerKm:     number
  efficiencyIndex:  number   // (speed m/s / HR) × 1000
}>
```

#### `zones.getActivityCalendar`

**Input**
```ts
{ days?: number }  // 1–730, default 365
```

**Output**
```ts
Array<{
  date:          string
  totalMinutes:  number
  activities:    number
  primarySport:  string
  maxStrain:     number
}>
```

#### `zones.getVolumeByWeek`

**Input**
```ts
{ days?: number }  // 1–730, default 365
```

**Output**
```ts
Array<{
  week:     string
  running:  number   // minutes
  walking:  number
  strength: number
  yoga:     number
  tennis:   number
  other:    number
  total:    number
}>
```

#### `zones.getPeakPerformances`

**Input**
```ts
{
  sportType?: string  // default "running"
  metric:     "pace" | "distance" | "duration" | "hr"
}
```

**Output**
```ts
Array<{
  month:        string   // "YYYY-MM"
  bestValue:    number
  activityDate: string
}>
```

---

### `baselines` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `baselines.get` | query | Get stored baseline values for the user |
| `baselines.compute` | mutation | Recompute baselines from last 90 days of data |

#### `baselines.get`

**Input** – none

**Output** – array of `AthleteBaseline` rows:
```ts
Array<{
  id: string
  metricName: "hrv" | "restingHr" | "sleep"
  baselineValue: number
  baselineSD: number | null
  zScoreLatest: number | null
  daysOfData: number
  computedAt: Date
}>
```

#### `baselines.compute`

**Input** – none

**Output** – array of upserted `AthleteBaseline` rows (hrv, restingHr, sleep).

**Example**
```ts
const baselines = await trpc.baselines.compute.mutate();
// [ { metricName: "hrv", baselineValue: 68.2, baselineSD: 7.1, zScoreLatest: -1.2 }, … ]
```

---

### `garmin` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `garmin.getConnectionStatus` | query | Check whether a Garmin account is linked |
| `garmin.initiateOAuth` | mutation | Start the Garmin OAuth 1.0a flow |
| `garmin.handleCallback` | mutation | Exchange OAuth verifier for access tokens |
| `garmin.triggerBackfill` | mutation | Backfill N days of Garmin data |

#### `garmin.getConnectionStatus`

**Input** – none

**Output**
```ts
{
  connected:     boolean
  garminUserId:  string | null
  lastSyncedAt:  string | null
}
```

#### `garmin.initiateOAuth`

**Input** – none

**Output**
```ts
{ authUrl: string }  // redirect the user to this URL
```

#### `garmin.handleCallback`

**Input**
```ts
{
  oauthToken:    string
  oauthVerifier: string
}
```

**Output**
```ts
{ success: boolean; garminUserId: string }
```

#### `garmin.triggerBackfill`

**Input**
```ts
{ days?: number }  // 1–90, default 30
```

**Output**
```ts
{ metricsInserted: number; activitiesInserted: number }
```

---

### `sessionReport` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `sessionReport.getByActivity` | query | Fetch the session report for an activity |
| `sessionReport.upsert` | mutation | Create or update a session report (RPE log) |

#### `sessionReport.getByActivity`

**Input**
```ts
{ activityId: string }
```

**Output** – `SessionReport` row or `null`.

#### `sessionReport.upsert`

**Input**
```ts
{
  activityId:       string
  garminActivityId?: string
  durationMinutes?: number
  rpe:              number   // int 1–10
  sessionType?:     "base" | "threshold" | "interval" | "recovery" | "race" | "strength" | "mobility"
  drillNotes?:      string
}
```

**Output** – the upserted `SessionReport` row with `internalLoad = rpe × durationMinutes`.

---

### `proactive` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `proactive.generateInsights` | mutation | Run 6-rule insight engine and persist results |
| `proactive.listInsights` | query | List AI insights from the last 7 days |
| `proactive.markRead` | mutation | Mark an insight as read |

#### `proactive.generateInsights`

**Input** – none

**Output**
```ts
{ generated: number; saved: number; insights: AiInsight[] }
```

Insight types generated: `injury_risk`, `overreaching`, `recovery_needed`,
`sleep_debt`, `load_spike`, `correlation_found`, `positive_trend`.

#### `proactive.listInsights`

**Input** – none

**Output** – array of `AiInsight` rows (up to 20, last 7 days):
```ts
Array<{
  id: string
  date: string
  insightType: string
  severity: "info" | "warn" | "critical"
  title: string
  body: string
  metrics: object
  confidence: number
  actionSuggestion: string
  isRead: boolean
  generatedBy: "rules" | "llm"
  createdAt: Date
}>
```

#### `proactive.markRead`

**Input**
```ts
{ id: string }  // UUID of the insight
```

**Output** – updated `AiInsight` row with `isRead: true`.

---

### `reference` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `reference.list` | query | List all reference measurements for the user |
| `reference.create` | mutation | Add a new reference measurement |
| `reference.delete` | mutation | Delete a reference measurement by ID |

#### `reference.list`

**Input** – none

**Output** – array of `ReferenceMeasurement` rows, newest first.

#### `reference.create`

**Input** – `CreateReferenceMeasurementSchema`:
```ts
{
  date:                   string
  metricName:             string   // e.g. "vo2max", "lactate_threshold"
  value:                  number
  unit:                   string
  source:                 string   // e.g. "lab", "field_test"
  garminComparableValue?: number   // if provided, deviationPercent is auto-computed
  notes?:                 string
}
```

**Output** – the created `ReferenceMeasurement` row with `deviationPercent` populated.

#### `reference.delete`

**Input**
```ts
{ id: string }  // UUID
```

**Output** – the deleted row or `null`.

---

### `dataQuality` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `dataQuality.list` | query | List data-quality log entries (last 30 days) |
| `dataQuality.getSummary` | query | Aggregate counts and quality score |
| `dataQuality.resolve` | mutation | Mark a log entry as resolved |

#### `dataQuality.list`

**Input** – none

**Output** – array of `DataQualityLog` rows (up to 100), newest first.

#### `dataQuality.getSummary`

**Input** – none

**Output**
```ts
{
  errors:   number
  warnings: number
  infos:    number
  total:    number
  score:    number  // 0–100 (100 - errors×10 - warnings×3)
  byDate:   Record<string, { errors: number; warnings: number; infos: number }>
}
```

#### `dataQuality.resolve`

**Input**
```ts
{ id: string }  // UUID
```

**Output** – updated `DataQualityLog` row with `resolvedAt` set, or `null`.

---

### `auth` router

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `auth.getSession` | query | public | Get the current session (or `null`) |
| `auth.getSecretMessage` | query | protected | Connectivity test endpoint |

#### `auth.getSession`

**Input** – none

**Output** – Better Auth session object or `null`.

---

### `post` router

> Internal demo router kept for framework reference.

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `post.all` | query | public | List last 10 posts |
| `post.byId` | query | public | Get a post by ID |
| `post.create` | mutation | protected | Create a post |
| `post.delete` | mutation | protected | Delete a post |

#### `post.all`

**Input** – none

**Output** – array of `Post` rows (up to 10), newest first.

#### `post.byId`

**Input**
```ts
{ id: string }
```

**Output** – `Post` row or `undefined`.

#### `post.create`

**Input** – `CreatePostSchema`:
```ts
{ title: string; content: string }
```

**Output** – insert result.

#### `post.delete`

**Input**
```ts
string  // post ID
```

**Output** – delete result.

---

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
