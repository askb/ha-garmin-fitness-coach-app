// @acme/engine — Evidence-Based Sport Science Engine
//
// All algorithms cite peer-reviewed research.
// See docs/sport-science-reference.md for full citations.

export type {
  DailyMetricInput,
  ActivityInput,
  Baselines,
  ReadinessZone,
  ReadinessComponents,
  ReadinessResult,
  SportType,
  GoalType,
  UserProfile,
  WorkoutStructureBlock,
  WorkoutRecommendation,
  RecoveryContext,
  AnomalyAlert,
  // New types
  TrainingLoadMetrics,
  TrainingStatusType,
  TrainingStatusResult,
  VO2maxEstimateResult,
  RacePredictionResult,
  RecoveryEstimate,
  SleepCoachResult,
  TrendDirection,
  TrendAnalysis,
  CorrelationPair,
  RunningFormScore,
  JournalEntryInput,
} from "./types";

export {
  calculateReadiness,
  scoreSleepQuantity,
  scoreSleepQuality,
  scoreHRV,
  scoreRestingHR,
  scoreTrainingLoad,
  scoreStressAndBattery,
  getReadinessZone,
  getZoneColor,
} from "./readiness";

export {
  computeTRIMP,
  computeStrainScore,
  computeACWR,
  computeACWR_EWMA,
  computeTrainingLoads,
  classifyLoadFocus,
  countConsecutiveHardDays,
} from "./strain";

export {
  computeBaselines,
  computeEMA,
  computeSD,
  computeZScore,
  zScoreToScore,
  getPopulationDefaults,
  getSleepNeedMinutes,
} from "./baselines";

export {
  detectAnomalies,
} from "./anomalies";

export {
  generateDailyWorkout,
  modulateWorkout,
  selectWeeklyTemplate,
  adjustDifficulty,
} from "./coaching";

// New modules
export {
  estimateVO2maxFromRunning,
  estimateVO2maxUth,
  estimateVO2maxCooper,
  predictRaceTimes,
  predictRaceTimesFromVO2max,
  computeVO2maxTrend,
} from "./vo2max";

export {
  classifyTrainingStatus,
  estimateRecoveryTime,
} from "./training-status";

export {
  calculateSleepNeed,
  calculateSleepDebt,
  generateSleepCoachResult,
} from "./sleep-coach";

export {
  analyzeTrend,
  computeRollingAverage,
  findNotableChanges,
} from "./trends";

export {
  computePearsonR,
  analyzeCorrelation,
  computeStandardCorrelations,
} from "./correlations";

export {
  analyzeRunningForm,
} from "./running-form";
