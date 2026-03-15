// Types shared across the engine

export interface DailyMetricInput {
  date: string;
  sleepScore: number | null;
  totalSleepMinutes: number | null;
  deepSleepMinutes: number | null;
  remSleepMinutes: number | null;
  lightSleepMinutes: number | null;
  awakeMinutes: number | null;
  hrv: number | null;
  restingHr: number | null;
  maxHr: number | null;
  stressScore: number | null;
  bodyBatteryStart: number | null;
  bodyBatteryEnd: number | null;
  steps: number | null;
  calories: number | null;
  garminTrainingReadiness: number | null;
  garminTrainingLoad: number | null;
}

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
}

export interface Baselines {
  hrv: number;
  restingHr: number;
  sleep: number; // minutes
  dailyStrainCapacity: number;
}

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
}

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
}

export interface WorkoutStructureBlock {
  phase: "warmup" | "main" | "cooldown";
  description: string;
  durationMinutes: number;
  hrZone?: number;
  pace?: string;
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

export interface AnomalyAlert {
  type: "hrv_crash" | "rhr_spike" | "sleep_deficit" | "overreaching" | "hr_drift";
  severity: "warning" | "critical";
  message: string;
  recommendation: string;
}
