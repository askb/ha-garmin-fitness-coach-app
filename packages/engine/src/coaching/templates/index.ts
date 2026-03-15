import type { WorkoutStructureBlock } from "../../types";

export interface WorkoutTemplate {
  id: string;
  sport: string;
  workoutType: string;
  title: string;
  description: string;
  intensity: "easy" | "moderate" | "hard" | "very_hard";
  durationRange: [number, number];
  hrZoneRange: [number, number];
  strainRange: [number, number];
  structure: WorkoutStructureBlock[];
}

export const runningTemplates: WorkoutTemplate[] = [
  {
    id: "run-easy",
    sport: "running",
    workoutType: "easy_run",
    title: "Easy Run",
    description: "Continuous easy pace, conversational effort",
    intensity: "easy",
    durationRange: [30, 45],
    hrZoneRange: [2, 2],
    strainRange: [4, 7],
    structure: [
      { phase: "warmup", description: "Walk 2 min, then easy jog", durationMinutes: 5, hrZone: 1 },
      { phase: "main", description: "Easy pace run", durationMinutes: 25, hrZone: 2 },
      { phase: "cooldown", description: "Walk 3-5 min", durationMinutes: 5, hrZone: 1 },
    ],
  },
  {
    id: "run-recovery",
    sport: "running",
    workoutType: "recovery_jog",
    title: "Recovery Jog",
    description: "Very easy effort, active recovery",
    intensity: "easy",
    durationRange: [20, 30],
    hrZoneRange: [1, 2],
    strainRange: [2, 4],
    structure: [
      { phase: "warmup", description: "Easy walk", durationMinutes: 3, hrZone: 1 },
      { phase: "main", description: "Very easy jog", durationMinutes: 20, hrZone: 1 },
      { phase: "cooldown", description: "Walk + stretch", durationMinutes: 5, hrZone: 1 },
    ],
  },
  {
    id: "run-tempo",
    sport: "running",
    workoutType: "tempo_run",
    title: "Tempo Run",
    description: "Sustained threshold effort to build lactate clearance",
    intensity: "hard",
    durationRange: [35, 50],
    hrZoneRange: [3, 4],
    strainRange: [10, 14],
    structure: [
      { phase: "warmup", description: "Easy jog with dynamic stretches", durationMinutes: 10, hrZone: 2 },
      { phase: "main", description: "Tempo pace, comfortably hard", durationMinutes: 25, hrZone: 4 },
      { phase: "cooldown", description: "Easy jog + walking", durationMinutes: 10, hrZone: 1 },
    ],
  },
  {
    id: "run-intervals-vo2",
    sport: "running",
    workoutType: "vo2_intervals",
    title: "VO2max Intervals",
    description: "High-intensity intervals to boost aerobic capacity",
    intensity: "very_hard",
    durationRange: [40, 55],
    hrZoneRange: [4, 5],
    strainRange: [14, 18],
    structure: [
      { phase: "warmup", description: "Easy jog + strides", durationMinutes: 10, hrZone: 2 },
      { phase: "main", description: "6x3 min hard with 2 min easy jog recovery", durationMinutes: 30, hrZone: 5 },
      { phase: "cooldown", description: "Easy jog + walking", durationMinutes: 10, hrZone: 1 },
    ],
  },
  {
    id: "run-long",
    sport: "running",
    workoutType: "long_run",
    title: "Long Run",
    description: "Extended aerobic endurance at easy pace",
    intensity: "moderate",
    durationRange: [60, 90],
    hrZoneRange: [2, 2],
    strainRange: [10, 14],
    structure: [
      { phase: "warmup", description: "Start very easy, build to pace", durationMinutes: 10, hrZone: 1 },
      { phase: "main", description: "Steady easy pace", durationMinutes: 60, hrZone: 2 },
      { phase: "cooldown", description: "Easy jog + walk", durationMinutes: 10, hrZone: 1 },
    ],
  },
  {
    id: "run-strides",
    sport: "running",
    workoutType: "easy_with_strides",
    title: "Easy Run + Strides",
    description: "Easy run with short speed bursts for neuromuscular activation",
    intensity: "easy",
    durationRange: [35, 45],
    hrZoneRange: [2, 5],
    strainRange: [5, 8],
    structure: [
      { phase: "warmup", description: "Easy jog", durationMinutes: 10, hrZone: 2 },
      { phase: "main", description: "Easy run, then 6x20s strides with full recovery", durationMinutes: 25, hrZone: 2 },
      { phase: "cooldown", description: "Easy jog + walk", durationMinutes: 5, hrZone: 1 },
    ],
  },
  {
    id: "run-fartlek",
    sport: "running",
    workoutType: "fartlek",
    title: "Fartlek Run",
    description: "Mixed pace, effort-based speed play",
    intensity: "moderate",
    durationRange: [35, 50],
    hrZoneRange: [2, 4],
    strainRange: [8, 12],
    structure: [
      { phase: "warmup", description: "Easy jog", durationMinutes: 10, hrZone: 2 },
      { phase: "main", description: "Alternate 2-3 min moderate/hard with 2-3 min easy", durationMinutes: 25, hrZone: 3 },
      { phase: "cooldown", description: "Easy jog", durationMinutes: 5, hrZone: 1 },
    ],
  },
];

export const cyclingTemplates: WorkoutTemplate[] = [
  {
    id: "cycle-endurance",
    sport: "cycling",
    workoutType: "endurance_ride",
    title: "Endurance Ride",
    description: "Steady state aerobic riding",
    intensity: "easy",
    durationRange: [60, 90],
    hrZoneRange: [2, 2],
    strainRange: [6, 10],
    structure: [
      { phase: "warmup", description: "Easy spin, build cadence", durationMinutes: 10, hrZone: 1 },
      { phase: "main", description: "Steady Zone 2 riding", durationMinutes: 60, hrZone: 2 },
      { phase: "cooldown", description: "Easy spin", durationMinutes: 10, hrZone: 1 },
    ],
  },
  {
    id: "cycle-recovery",
    sport: "cycling",
    workoutType: "recovery_spin",
    title: "Recovery Spin",
    description: "Very easy, high cadence recovery",
    intensity: "easy",
    durationRange: [30, 40],
    hrZoneRange: [1, 1],
    strainRange: [2, 4],
    structure: [
      { phase: "warmup", description: "Easy spin", durationMinutes: 5, hrZone: 1 },
      { phase: "main", description: "Very easy spin, high cadence (90+)", durationMinutes: 25, hrZone: 1 },
      { phase: "cooldown", description: "Easy spin", durationMinutes: 5, hrZone: 1 },
    ],
  },
  {
    id: "cycle-sweetspot",
    sport: "cycling",
    workoutType: "sweet_spot",
    title: "Sweet Spot Intervals",
    description: "Sub-threshold intervals at 88-93% FTP",
    intensity: "hard",
    durationRange: [50, 70],
    hrZoneRange: [3, 4],
    strainRange: [10, 14],
    structure: [
      { phase: "warmup", description: "Progressive spin", durationMinutes: 10, hrZone: 2 },
      { phase: "main", description: "3x10 min at sweet spot with 5 min recovery", durationMinutes: 45, hrZone: 4 },
      { phase: "cooldown", description: "Easy spin", durationMinutes: 10, hrZone: 1 },
    ],
  },
  {
    id: "cycle-vo2",
    sport: "cycling",
    workoutType: "vo2_intervals",
    title: "VO2max Intervals",
    description: "Short, intense intervals at 106-120% FTP",
    intensity: "very_hard",
    durationRange: [45, 60],
    hrZoneRange: [5, 5],
    strainRange: [14, 18],
    structure: [
      { phase: "warmup", description: "Progressive build", durationMinutes: 10, hrZone: 2 },
      { phase: "main", description: "5x4 min at VO2max with 4 min easy", durationMinutes: 40, hrZone: 5 },
      { phase: "cooldown", description: "Easy spin", durationMinutes: 10, hrZone: 1 },
    ],
  },
];

export const strengthTemplates: WorkoutTemplate[] = [
  {
    id: "str-upper-heavy",
    sport: "strength",
    workoutType: "upper_heavy",
    title: "Upper Body Heavy",
    description: "Compound upper body lifts, strength focus",
    intensity: "hard",
    durationRange: [45, 60],
    hrZoneRange: [2, 3],
    strainRange: [8, 12],
    structure: [
      { phase: "warmup", description: "5 min light cardio + band work", durationMinutes: 5 },
      { phase: "main", description: "Bench 4x5, OHP 4x5, Row 4x5, then 3x10 accessories", durationMinutes: 45 },
      { phase: "cooldown", description: "Stretching", durationMinutes: 5 },
    ],
  },
  {
    id: "str-lower-heavy",
    sport: "strength",
    workoutType: "lower_heavy",
    title: "Lower Body Heavy",
    description: "Squat and deadlift focus, strength building",
    intensity: "hard",
    durationRange: [45, 60],
    hrZoneRange: [2, 4],
    strainRange: [10, 14],
    structure: [
      { phase: "warmup", description: "5 min bike + mobility", durationMinutes: 5 },
      { phase: "main", description: "Squat 4x5, RDL 4x5, Lunges 3x8, then accessories", durationMinutes: 45 },
      { phase: "cooldown", description: "Foam roll + stretch", durationMinutes: 5 },
    ],
  },
  {
    id: "str-full-moderate",
    sport: "strength",
    workoutType: "full_body",
    title: "Full Body Moderate",
    description: "All major muscle groups, moderate intensity",
    intensity: "moderate",
    durationRange: [40, 50],
    hrZoneRange: [2, 3],
    strainRange: [7, 10],
    structure: [
      { phase: "warmup", description: "Dynamic warm-up", durationMinutes: 5 },
      { phase: "main", description: "3x8 compound lifts (squat, bench, row, OHP) + 2x12 accessories", durationMinutes: 35 },
      { phase: "cooldown", description: "Stretch", durationMinutes: 5 },
    ],
  },
  {
    id: "str-deload",
    sport: "strength",
    workoutType: "deload",
    title: "Deload Session",
    description: "Reduced volume and intensity for recovery",
    intensity: "easy",
    durationRange: [30, 40],
    hrZoneRange: [1, 2],
    strainRange: [3, 5],
    structure: [
      { phase: "warmup", description: "Light cardio", durationMinutes: 5 },
      { phase: "main", description: "3x5 at 60% normal load on main lifts", durationMinutes: 25 },
      { phase: "cooldown", description: "Mobility work", durationMinutes: 10 },
    ],
  },
];

export const allTemplates: WorkoutTemplate[] = [
  ...runningTemplates,
  ...cyclingTemplates,
  ...strengthTemplates,
];
