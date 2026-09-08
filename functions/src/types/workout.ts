/**
 * Shared types for the deterministic workout-generation engine.
 *
 * This is intentionally NOT an AI feature (Step 14 forbids that) — every
 * value here is either a fixed enum the questionnaire already produces, or a
 * value this engine computes with plain rules. See `../constants/goals.ts`,
 * `../constants/equipment.ts`, and `../constants/limitations.ts` for the
 * actual mapping tables.
 */

/**
 * The 8 goal values the questionnaire's GoalsQuestionnaire.js screen
 * presents today (see `../constants/goals.ts` for the exact source strings
 * this maps from). Canonical, internal, snake_case — never shown to users.
 */
export type Goal =
  | "strength_training"
  | "powerlifting"
  | "health"
  | "weight_loss"
  | "muscle_gain"
  | "body_recomposition"
  | "general_fitness"
  | "athletic_performance";

export type Experience = "beginner" | "intermediate" | "advanced";

/**
 * Canonical equipment tags. "full_gym" and "bodyweight" are special: they
 * expand to "the user can do anything" / "only bodyweight-tagged exercises"
 * respectively, rather than being an equipment tag an exercise itself
 * carries. See `resolveEquipment()` in `../constants/equipment.ts`.
 */
export type Equipment =
  | "full_gym"
  | "bodyweight"
  | "dumbbell"
  | "barbell"
  | "cable"
  | "smith_machine"
  | "machine"
  | "pull_up_dip_bars"
  | "band";

export type MovementType = "compound" | "isolation" | "cardio" | "mobility" | "plyometric";

export type Difficulty = "beginner" | "intermediate" | "advanced";

/**
 * Body-region tags derived from the questionnaire's free-text `modifications`
 * field (see `../constants/limitations.ts`). Deliberately a small, fixed,
 * deterministic keyword vocabulary — not free-text medical interpretation.
 */
export type LimitationTag =
  | "knee"
  | "shoulder"
  | "lower_back"
  | "wrist"
  | "ankle"
  | "hip"
  | "neck"
  | "elbow";

export const BODY_PARTS = [
  "chest",
  "back",
  "shoulders",
  "legs",
  "arms",
  "core",
  "cardio",
] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export interface CatalogExercise {
  id: string;
  name: string;
  bodyPart: BodyPart;
  muscle: string;
  equipment: Equipment;
  difficulty: Difficulty;
  movementType: MovementType;
  /** Limitations this exercise is unsafe for. Empty = safe for everyone. */
  contraindications: LimitationTag[];
  /** ids of approved alternatives, ideally safe for the same contraindications this exercise fails. */
  alternatives: string[];
  instructions: string[];
  formCues: string[];
  gifUrl?: string;
}

/** Raw profile fields as they exist in the `Users/{uid}` Firestore document today. Untyped on purpose — this is exactly what's on disk, good or bad, and normalization is where we make it safe. */
export interface RawUserProfile {
  goal?: unknown;
  gymExperience?: unknown;
  availableEquipment?: unknown;
  weeklyWorkoutCommitment?: unknown;
  modifications?: unknown;
  age?: unknown;
  gender?: unknown;
  height?: unknown;
  weight?: unknown;
  fullName?: unknown;
  [key: string]: unknown;
}

export interface NormalizedProfile {
  goal: Goal;
  experience: Experience;
  /** Fully expanded canonical equipment set the user has access to (never empty — "bodyweight" at minimum). */
  equipment: Equipment[];
  frequencyDays: number;
  limitations: LimitationTag[];
  age: number;
  gender: string;
  heightCm: number;
  weightKg: number;
  fullName: string;
}

export interface PlanExercise {
  id: string;
  name: string;
  bodyPart: BodyPart;
  equipment: Equipment;
  sets: number;
  reps: string; // e.g. "8-12"
  restSeconds: number;
  weight?: number;
}

export interface DailyWorkout {
  dayLabel: string; // e.g. "Push", "Rest"
  bodyParts: BodyPart[];
  exercises: PlanExercise[];
}

export interface GeneratedPlan {
  planId: string;
  schemaVersion: number;
  userProfile: {
    name: string;
    age: number;
    gender: string;
    height: string;
    weight: string;
    goal: Goal;
    experience: Experience;
    equipment: Equipment[];
    weekly_workouts: number;
    limitations: LimitationTag[];
  };
  goal: Goal;
  weekly_split: string[];
  daily_workouts: Record<string, PlanExercise[]>;
  warmup: string[];
  cooldown: string[];
  workout_guidelines: string[];
  recovery: string[];
  nutrition: {
    calorieDirection: "surplus" | "deficit" | "maintenance";
    proteinGramsPerKg: number;
    notes: string[];
  };
  generatedAt: string;
  source: "Deterministic Workout Engine";
  weekNumber: number;
  previousPlanId: string | null;
}
