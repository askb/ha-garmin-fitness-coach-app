/**
 * Types shared across the @acme/engine package.
 *
 * All algorithms are grounded in peer-reviewed sport science.
 * See docs/sport-science-reference.md for full citations.
 */

// ---------------------------------------------------------------------------
// Daily Metrics (from Garmin sync)
// ---------------------------------------------------------------------------
export interface DailyMetricInput {
  date: string;
  sleepScore: number | null;
  totalSleepMinutes: number | null;
  deepSleepMinutes: number | null;
  remSleepMinutes: number | null;
  lightSleepMinutes: number | null;
  awakeMinutes: number | null;
  hrv: number | null; // lnRMSSD preferred (Plews et al. 2012)
  restingHr: number | null;
  maxHr: number | null;
  stressScore: number | null;
  bodyBatteryStart: number | null;
  bodyBatteryEnd: number | null;
  steps: number | null;
  calories: number | null;
  garminTrainingReadiness: number | null;
  garminTrainingLoad: number | null;
  // New fields for expanded metrics
  respirationRate: number | null;
  spo2: number | null;
  skinTemp: number | null;
  intensityMinutes: number | null;
  floorsClimbed: number | null;
  bodyBatteryHigh: number | null;
  bodyBatteryLow: number | null;
  hrvOvernight: number[] | null;
  sleepStartTime: string | null;
  sleepEndTime: string | null;
  sleepNeedMinutes: number | null;
  sleepDebtMinutes: number | null;
}

// ---------------------------------------------------------------------------
// Activity (from Garmin sync)
// ---------------------------------------------------------------------------
export interface ActivityInput {
  sportType: string;
  subType: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number;
  distanceMeters: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPaceSecPerKm: number | null;
  calories: number | null;
  trimpScore: number | null;
  strainScore: number | null;
  vo2maxEstimate: number | null;
  // New fields
  avgPower: number | null;
  maxPower: number | null;
  normalizedPower: number | null;
  avgCadence: number | null;
  elevationGain: number | null;
  elevationLoss: number | null;
  aerobicTE: number | null; // 0-5 (Firstbeat)
  anaerobicTE: number | null; // 0-5 (Firstbeat)
  epocMl: number | null;
  avgGroundContactTime: number | null; // ms
  gctBalance: number | null; // % L/R
  verticalOscillation: number | null; // cm
  verticalRatio: number | null; // %
  strideLength: number | null; // meters
  hrZoneMinutes: { zone1: number; zone2: number; zone3: number; zone4: number; zone5: number } | null;
  laps: Array<{ index: number; distanceMeters: number; durationSeconds: number; avgHr?: number; avgPace?: number }> | null;
}

// ---------------------------------------------------------------------------
// Baselines — now includes standard deviation for z-score calculations
// Ref: Buchheit M. Monitoring training status with HR measures. IJSPP. 2014;9:883-895.
// ---------------------------------------------------------------------------
export interface Baselines {
  hrv: number;
  hrvSD: number; // standard deviation for z-score
  restingHr: number;
  restingHrSD: number;
  sleep: number; // minutes
  sleepSD: number;
  dailyStrainCapacity: number;
  daysOfData: number; // for confidence tracking
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------
export type ReadinessZone = "prime" | "high" | "moderate" | "low" | "poor";

export interface ReadinessComponents {
  sleepQuantity: number;
  sleepQuality: number;
  hrv: number;
  restingHr: number;
  trainingLoad: number;
  stress: number;
}

export interface ReadinessResult {
  score: number;
  zone: ReadinessZone;
  color: string;
  explanation: string;
  components: ReadinessComponents;
  confidence: "low" | "medium" | "high"; // based on data availability
}

// ---------------------------------------------------------------------------
// Training Load — Banister Fitness-Fatigue Model
// Ref: Banister EW et al. A systems model of training for athletic performance.
//      Aust J Sci Med Sport. 1975;7:57-61.
// ---------------------------------------------------------------------------
export interface TrainingLoadMetrics {
  ctl: number; // Chronic Training Load (42-day EMA = "fitness")
  atl: number; // Acute Training Load (7-day EMA = "fatigue")
  tsb: number; // Training Stress Balance = CTL - ATL ("form")
  acwr: number; // Acute:Chronic Workload Ratio
  loadFocus: "aerobic" | "anaerobic" | "mixed";
  rampRate: number; // weekly CTL change (safe: <5-8 pts/week)
}

// ---------------------------------------------------------------------------
// Training Status — based on VO2max trend + training load
// Ref: Meeusen R et al. Prevention, diagnosis, and treatment of overtraining
//      syndrome: ECSS position statement. Eur J Sport Sci. 2013;13(1):1-24.
// ---------------------------------------------------------------------------
export type TrainingStatusType =
  | "productive"
  | "maintaining"
  | "detraining"
  | "overreaching"
  | "peaking"
  | "recovery"
  | "unproductive";

export interface TrainingStatusResult {
  status: TrainingStatusType;
  vo2maxTrend: number; // ml/kg/min change over 4 weeks
  explanation: string;
  recommendation: string;
}

// ---------------------------------------------------------------------------
// VO2max — ACSM running equation + Uth et al. (2004) estimate
// ---------------------------------------------------------------------------
export interface VO2maxEstimateResult {
  value: number; // ml/kg/min
  source: "running_pace_hr" | "uth_ratio" | "cooper" | "manual";
  confidence: "low" | "medium" | "high";
}

// ---------------------------------------------------------------------------
// Race Prediction — Riegel (1981) + Daniels VDOT
// Ref: Riegel PS. Athletic Records and Human Endurance. Am Sci. 1981;69(3):285-290.
// ---------------------------------------------------------------------------
export interface RacePredictionResult {
  distance: "5K" | "10K" | "half_marathon" | "marathon";
  distanceMeters: number;
  predictedSeconds: number;
  predictedFormatted: string; // "HH:MM:SS"
  method: "riegel" | "vdot" | "cameron";
  vo2maxUsed: number;
}

// ---------------------------------------------------------------------------
// Recovery — Hausswirth & Mujika (2013)
// ---------------------------------------------------------------------------
export interface RecoveryEstimate {
  hoursUntilRecovered: number;
  readyAt: string; // ISO datetime
  factors: string[]; // what's influencing recovery time
}

// ---------------------------------------------------------------------------
// Sleep Coach — Hirshkowitz et al. (2015), Bird (2013)
// ---------------------------------------------------------------------------
export interface SleepCoachResult {
  recommendedMinutes: number;
  recommendedBedtime: string | null; // "22:00"
  recommendedWakeTime: string | null;
  sleepDebtMinutes: number;
  insight: string;
}

// ---------------------------------------------------------------------------
// Long-term Trend Analysis
// ---------------------------------------------------------------------------
export type TrendDirection = "improving" | "stable" | "declining";

export interface TrendAnalysis {
  metric: string;
  period: "30d" | "90d" | "180d" | "365d";
  direction: TrendDirection;
  rateOfChange: number; // units per week
  startValue: number;
  endValue: number;
  percentChange: number;
  significance: "high" | "medium" | "low"; // based on sample size + variance
}

// ---------------------------------------------------------------------------
// Correlation Analysis — Pearson r
// ---------------------------------------------------------------------------
export interface CorrelationPair {
  metricA: string;
  metricB: string;
  rValue: number; // -1 to 1
  pValue: number;
  sampleSize: number;
  direction: "positive" | "negative" | "none";
  strength: "strong" | "moderate" | "weak" | "none";
  insight: string;
}

// ---------------------------------------------------------------------------
// Running Form — Santos-Concejero et al. (2014), Cavanagh & Williams (1982)
// ---------------------------------------------------------------------------
export interface RunningFormScore {
  overall: number; // 0-100
  groundContactTime: { value: number; rating: "elite" | "good" | "average" | "poor" };
  verticalOscillation: { value: number; rating: "elite" | "good" | "average" | "poor" };
  strideLength: { value: number; rating: "optimal" | "overstriding" | "understriding" };
  gctBalance: { value: number; rating: "balanced" | "slight_imbalance" | "imbalanced" };
  cadence: { value: number; rating: "optimal" | "low" | "high" };
}

// ---------------------------------------------------------------------------
// Sport Types & Goals
// ---------------------------------------------------------------------------
export type SportType =
  | "running"
  | "cycling"
  | "strength"
  | "swimming"
  | "team_sport"
  | "other";

export type GoalType =
  | "maintain"
  | "performance"
  | "body_composition"
  | "return_from_injury";

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------
export interface UserProfile {
  age: number | null;
  sex: string | null;
  massKg: number | null;
  heightCm: number | null;
  experienceLevel: string;
  primarySports: string[];
  goals: { sport: string; goalType: string; target?: string }[];
  weeklyDays: string[];
  minutesPerDay: number;
  maxHr: number | null;
  restingHrBaseline: number | null;
  hrvBaseline: number | null;
  sleepBaseline: number | null;
  vo2maxRunning: number | null;
  vo2maxCycling: number | null;
  lactateThreshold: number | null;
  functionalThresholdPower: number | null;
  audienceMode: "athlete" | "health" | "all";
}

// ---------------------------------------------------------------------------
// Workout Types
// ---------------------------------------------------------------------------
export interface WorkoutStructureBlock {
  phase: "warmup" | "main" | "cooldown";
  description: string;
  durationMinutes: number;
  hrZone?: number;
  pace?: string;
  powerTarget?: string;
}

export interface WorkoutRecommendation {
  sportType: string;
  workoutType: string;
  title: string;
  description: string;
  targetDurationMin: number;
  targetDurationMax: number;
  targetHrZoneLow: number;
  targetHrZoneHigh: number;
  targetStrainLow: number;
  targetStrainHigh: number;
  structure: WorkoutStructureBlock[];
  explanation: string;
}

// ---------------------------------------------------------------------------
// Anomalies & Alerts
// ---------------------------------------------------------------------------
export interface AnomalyAlert {
  type: "hrv_crash" | "rhr_spike" | "sleep_deficit" | "overreaching" | "hr_drift";
  severity: "warning" | "critical";
  message: string;
  recommendation: string;
  citation?: string; // sport science reference
}

// ---------------------------------------------------------------------------
// Journal Entry (for correlation analysis)
// ---------------------------------------------------------------------------
export interface JournalEntryInput {
  date: string;
  tags: Record<string, number | boolean | string>;
  notes: string | null;
}
