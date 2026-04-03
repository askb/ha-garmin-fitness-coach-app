import type { ReadinessZone, RecoveryContext, WorkoutRecommendation, UserProfile } from "../types";
import type { WorkoutTemplate } from "./templates";
import { allTemplates, runningTemplates, cyclingTemplates, strengthTemplates } from "./templates";

// ---- Weekly Plan Templates ----

interface WeekSlot {
  dayIndex: number; // 0-6 (Mon-Sun)
  sessionType: string;
  intensity: "easy" | "moderate" | "hard" | "very_hard";
}

const WEEKLY_TEMPLATES: Record<string, WeekSlot[]> = {
  "running-performance-5d": [
    { dayIndex: 0, sessionType: "easy_run", intensity: "easy" },
    { dayIndex: 1, sessionType: "vo2_intervals", intensity: "very_hard" },
    { dayIndex: 2, sessionType: "recovery_jog", intensity: "easy" },
    { dayIndex: 3, sessionType: "tempo_run", intensity: "hard" },
    { dayIndex: 5, sessionType: "long_run", intensity: "moderate" },
  ],
  "running-performance-3d": [
    { dayIndex: 1, sessionType: "vo2_intervals", intensity: "very_hard" },
    { dayIndex: 3, sessionType: "tempo_run", intensity: "hard" },
    { dayIndex: 5, sessionType: "long_run", intensity: "moderate" },
  ],
  "running-maintain-3d": [
    { dayIndex: 0, sessionType: "easy_run", intensity: "easy" },
    { dayIndex: 2, sessionType: "fartlek", intensity: "moderate" },
    { dayIndex: 5, sessionType: "long_run", intensity: "moderate" },
  ],
  "cycling-performance-5d": [
    { dayIndex: 0, sessionType: "endurance_ride", intensity: "easy" },
    { dayIndex: 1, sessionType: "sweet_spot", intensity: "hard" },
    { dayIndex: 2, sessionType: "recovery_spin", intensity: "easy" },
    { dayIndex: 3, sessionType: "vo2_intervals", intensity: "very_hard" },
    { dayIndex: 5, sessionType: "endurance_ride", intensity: "easy" },
  ],
  "cycling-maintain-3d": [
    { dayIndex: 0, sessionType: "endurance_ride", intensity: "easy" },
    { dayIndex: 2, sessionType: "sweet_spot", intensity: "hard" },
    { dayIndex: 5, sessionType: "endurance_ride", intensity: "easy" },
  ],
  "strength-performance-3d": [
    { dayIndex: 0, sessionType: "upper_heavy", intensity: "hard" },
    { dayIndex: 2, sessionType: "lower_heavy", intensity: "hard" },
    { dayIndex: 4, sessionType: "full_body", intensity: "moderate" },
  ],
  "strength-body_composition-4d": [
    { dayIndex: 0, sessionType: "upper_heavy", intensity: "hard" },
    { dayIndex: 1, sessionType: "conditioning", intensity: "moderate" },
    { dayIndex: 3, sessionType: "lower_heavy", intensity: "hard" },
    { dayIndex: 4, sessionType: "conditioning", intensity: "moderate" },
  ],
};

/**
 * Select the best weekly template based on sport, goal, and available days.
 */
export function selectWeeklyTemplate(
  sport: string,
  goalType: string,
  availableDays: number,
): WeekSlot[] {
  // Try exact match first
  const daysKey = availableDays >= 5 ? "5d" : "3d";
  const key = `${sport}-${goalType}-${daysKey}`;
  if (WEEKLY_TEMPLATES[key]) return WEEKLY_TEMPLATES[key];

  // Try with fewer days
  const altKey = `${sport}-${goalType}-3d`;
  if (WEEKLY_TEMPLATES[altKey]) return WEEKLY_TEMPLATES[altKey];

  // Fallback to maintain template
  const fallbackKey = `${sport}-maintain-3d`;
  if (WEEKLY_TEMPLATES[fallbackKey]) return WEEKLY_TEMPLATES[fallbackKey];

  // Ultimate fallback: 3 easy runs
  return [
    { dayIndex: 0, sessionType: "easy_run", intensity: "easy" },
    { dayIndex: 2, sessionType: "easy_run", intensity: "easy" },
    { dayIndex: 5, sessionType: "long_run", intensity: "moderate" },
  ];
}

/**
 * Find a workout template by sport and workout type.
 */
function findTemplate(sport: string, workoutType: string): WorkoutTemplate | undefined {
  return allTemplates.find(
    (t) => t.sport === sport && t.workoutType === workoutType,
  );
}

/**
 * Get the easy/recovery template for a sport.
 */
function getEasyTemplate(sport: string): WorkoutTemplate {
  const easy = allTemplates.find(
    (t) => t.sport === sport && t.intensity === "easy",
  );
  return easy ?? runningTemplates[0]!; // fallback to easy run
}

/**
 * Get the rest recommendation (complete rest).
 */
function getRestRecommendation(reason: string): WorkoutRecommendation {
  return {
    sportType: "rest",
    workoutType: "rest",
    title: "Rest Day",
    description: "Complete rest or light walking. Your body needs recovery.",
    targetDurationMin: 0,
    targetDurationMax: 20,
    targetHrZoneLow: 1,
    targetHrZoneHigh: 1,
    targetStrainLow: 0,
    targetStrainHigh: 2,
    structure: [
      { phase: "main", description: "Light walk or complete rest", durationMinutes: 20, hrZone: 1 },
    ],
    explanation: reason,
  };
}

/**
 * Get an active recovery recommendation (light movement, Zone 1).
 *
 * Active recovery promotes blood flow and adaptation without adding
 * significant training stress. Preferred over complete rest when the
 * athlete is fatigued but not critically depleted.
 *
 * Ref: Barnett A. Using recovery modalities between training sessions
 *      in elite athletes. Sports Med. 2006;36(9):781-796.
 */
function getActiveRecoveryRecommendation(sport: string, reason: string): WorkoutRecommendation {
  const descriptions: Record<string, string> = {
    running: "Very easy jog or walk — conversational pace only",
    cycling: "Easy spin — light resistance, high cadence",
    strength: "Mobility work, foam rolling, and light stretching",
  };
  const desc = descriptions[sport] ?? "Light movement — keep it easy and short";

  return {
    sportType: sport,
    workoutType: "active_recovery",
    title: "Active Recovery",
    description: desc,
    targetDurationMin: 30,
    targetDurationMax: 30,
    targetHrZoneLow: 1,
    targetHrZoneHigh: 1,
    targetStrainLow: 0,
    targetStrainHigh: 3,
    structure: [
      { phase: "warmup", description: "Gentle start", durationMinutes: 5, hrZone: 1 },
      { phase: "main", description: desc, durationMinutes: 20, hrZone: 1 },
      { phase: "cooldown", description: "Easy stretching", durationMinutes: 5, hrZone: 1 },
    ],
    explanation: reason,
  };
}

/**
 * Determine whether "poor" readiness truly requires complete rest, or
 * whether active recovery is more appropriate.
 *
 * Complete rest is reserved for critical states:
 * - ACWR > 1.5 (high injury risk zone, Hulin 2016)
 * - TSB < -25 (functional overreaching, Meeusen 2013)
 * - Body Battery < 20 (critically depleted energy reserves)
 * - Sleep debt > 3 hours (Mah 2011: impairs reaction time and power)
 *
 * Otherwise, active recovery is preferred — it promotes adaptation
 * without adding significant training stress (Barnett 2006).
 */
function recommendForPoorReadiness(
  sport: string,
  recovery: RecoveryContext | undefined,
): WorkoutRecommendation {
  // Without recovery context, default to active recovery (conservative but
  // not complete rest — active recovery promotes adaptation per Barnett 2006)
  if (!recovery) {
    return getActiveRecoveryRecommendation(
      sport,
      "Readiness is poor — light active recovery to promote blood flow.",
    );
  }

  // Critical rest triggers — any one is sufficient for complete rest
  if (recovery.acwr !== null && recovery.acwr > 1.5) {
    return getRestRecommendation(
      `ACWR is ${recovery.acwr.toFixed(2)} — high injury risk zone (>1.5). Complete rest recommended.`,
    );
  }
  if (recovery.tsb !== null && recovery.tsb < -25) {
    return getRestRecommendation(
      `TSB is ${recovery.tsb.toFixed(0)} — deep overreach zone. Rest to prevent overtraining.`,
    );
  }
  if (recovery.bodyBattery !== null && recovery.bodyBattery < 20) {
    return getRestRecommendation(
      `Body Battery critically low (${recovery.bodyBattery}%). Rest today.`,
    );
  }
  if (recovery.sleepDebtMinutes !== null && recovery.sleepDebtMinutes > 180) {
    const hours = (recovery.sleepDebtMinutes / 60).toFixed(1);
    return getRestRecommendation(
      `Sleep debt is ${hours}h — prioritize rest and catch up on sleep.`,
    );
  }

  // Poor readiness but no critical signals → active recovery
  return getActiveRecoveryRecommendation(
    sport,
    "Readiness is poor but no critical risk signals — light active recovery to promote blood flow and adaptation.",
  );
}

/**
 * Modulate a workout template based on readiness zone and recovery signals.
 *
 * Prime   → promote hard session or intensify +5%
 * High    → execute as planned
 * Moderate→ reduce volume -10%
 * Low     → substitute easy/technique
 * Poor    → evidence-based: rest only if critical signals, else active recovery
 *
 * Ref: Hulin 2016 (ACWR), Meeusen 2013 (overreaching), Barnett 2006 (recovery)
 */
export function modulateWorkout(
  template: WorkoutTemplate,
  readinessZone: ReadinessZone,
  sport: string,
  recovery?: RecoveryContext,
): WorkoutRecommendation {
  if (readinessZone === "poor") {
    return recommendForPoorReadiness(sport, recovery);
  }

  if (readinessZone === "low" && (template.intensity === "hard" || template.intensity === "very_hard")) {
    // Substitute with easy template
    const easy = getEasyTemplate(sport);
    return templateToRecommendation(easy, readinessZone, "Readiness is low — swapped hard session for easy recovery.");
  }

  const durationScale = readinessZone === "moderate" ? 0.9 : readinessZone === "prime" ? 1.05 : 1.0;
  const explanation = getModulationExplanation(template, readinessZone);

  return {
    sportType: template.sport,
    workoutType: template.workoutType,
    title: template.title,
    description: template.description,
    targetDurationMin: Math.round(template.durationRange[0] * durationScale),
    targetDurationMax: Math.round(template.durationRange[1] * durationScale),
    targetHrZoneLow: template.hrZoneRange[0],
    targetHrZoneHigh: template.hrZoneRange[1],
    targetStrainLow: template.strainRange[0],
    targetStrainHigh: template.strainRange[1],
    structure: template.structure.map((block) => ({
      ...block,
      durationMinutes: Math.round(block.durationMinutes * durationScale),
    })),
    explanation,
  };
}

function templateToRecommendation(
  template: WorkoutTemplate,
  zone: ReadinessZone,
  explanation: string,
): WorkoutRecommendation {
  return {
    sportType: template.sport,
    workoutType: template.workoutType,
    title: template.title,
    description: template.description,
    targetDurationMin: template.durationRange[0],
    targetDurationMax: template.durationRange[1],
    targetHrZoneLow: template.hrZoneRange[0],
    targetHrZoneHigh: template.hrZoneRange[1],
    targetStrainLow: template.strainRange[0],
    targetStrainHigh: template.strainRange[1],
    structure: template.structure,
    explanation,
  };
}

function getModulationExplanation(template: WorkoutTemplate, zone: ReadinessZone): string {
  switch (zone) {
    case "prime":
      return `Your readiness is Prime — great day for ${template.title.toLowerCase()}. Push the pace if it feels right!`;
    case "high":
      return `Readiness is good — ${template.title.toLowerCase()} as planned.`;
    case "moderate":
      return `Moderate readiness — running ${template.title.toLowerCase()} with slightly reduced volume (-10%).`;
    case "low":
      return `Low readiness — keeping it easy today.`;
    default:
      return `${template.title} scheduled for today.`;
  }
}

/**
 * Generate today's workout recommendation given the day's plan and readiness.
 *
 * When recovery context is provided, "poor" readiness uses evidence-based
 * decision logic instead of unconditionally prescribing rest. This addresses
 * the Garmin Coach "always rest day" sync bug by providing our own
 * intelligent recommendations.
 */
export function generateDailyWorkout(
  sport: string,
  goalType: string,
  dayOfWeek: number, // 0 = Monday
  availableDays: number,
  readinessZone: ReadinessZone,
  recentHardDays: number, // consecutive hard days
  recovery?: RecoveryContext,
): WorkoutRecommendation {
  // Force easy day after 2+ consecutive hard days
  if (recentHardDays >= 2 && readinessZone !== "prime") {
    const easy = getEasyTemplate(sport);
    return templateToRecommendation(
      easy,
      readinessZone,
      "Forced easy day — you've had 2+ hard sessions in a row.",
    );
  }

  const weekTemplate = selectWeeklyTemplate(sport, goalType, availableDays);

  // Find today's slot
  const todaySlot = weekTemplate.find((s) => s.dayIndex === dayOfWeek);
  if (!todaySlot) {
    // Rest day in the weekly plan template
    return getRestRecommendation("Scheduled rest day in your weekly plan.");
  }

  // Find the corresponding workout template
  const template = findTemplate(sport, todaySlot.sessionType);
  if (!template) {
    const easy = getEasyTemplate(sport);
    return templateToRecommendation(easy, readinessZone, "Default easy session.");
  }

  // Prime readiness + easy day planned → consider promoting
  if (readinessZone === "prime" && todaySlot.intensity === "easy") {
    // Look for a harder session later in the week to swap
    const harderSlot = weekTemplate.find(
      (s) => s.dayIndex > dayOfWeek && (s.intensity === "hard" || s.intensity === "very_hard"),
    );
    if (harderSlot) {
      const harderTemplate = findTemplate(sport, harderSlot.sessionType);
      if (harderTemplate) {
        return modulateWorkout(harderTemplate, readinessZone, sport, recovery);
      }
    }
  }

  return modulateWorkout(template, readinessZone, sport, recovery);
}

/**
 * Adjust difficulty up or down by 1 zone equivalent.
 */
export function adjustDifficulty(
  current: WorkoutRecommendation,
  direction: "harder" | "easier",
  sport: string,
): WorkoutRecommendation {
  if (direction === "easier") {
    // Reduce duration by 20%, drop HR zones
    return {
      ...current,
      targetDurationMin: Math.round(current.targetDurationMin * 0.8),
      targetDurationMax: Math.round(current.targetDurationMax * 0.8),
      targetHrZoneLow: Math.max(1, current.targetHrZoneLow - 1),
      targetHrZoneHigh: Math.max(1, current.targetHrZoneHigh - 1),
      structure: current.structure.map((b) => ({
        ...b,
        durationMinutes: Math.round(b.durationMinutes * 0.8),
        hrZone: b.hrZone ? Math.max(1, b.hrZone - 1) : undefined,
      })),
      explanation: "Adjusted down — taking it easier today.",
    };
  }

  // Harder: increase duration 10%, push HR zones up
  return {
    ...current,
    targetDurationMin: Math.round(current.targetDurationMin * 1.1),
    targetDurationMax: Math.round(current.targetDurationMax * 1.1),
    targetHrZoneLow: Math.min(5, current.targetHrZoneLow + 1),
    targetHrZoneHigh: Math.min(5, current.targetHrZoneHigh + 1),
    structure: current.structure.map((b) => ({
      ...b,
      durationMinutes: Math.round(b.durationMinutes * 1.1),
      hrZone: b.hrZone ? Math.min(5, b.hrZone + 1) : undefined,
    })),
    explanation: "Adjusted up — feeling fresh, let's push it!",
  };
}
