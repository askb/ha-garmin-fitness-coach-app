// @acme/engine — Core readiness, strain, and coaching logic

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
  AnomalyAlert,
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
  countConsecutiveHardDays,
} from "./strain";

export {
  computeBaselines,
  computeEMA,
  getPopulationDefaults,
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
