export type CompletionStatus = "completed" | "skipped" | "partial";

export interface ExercisePerformance {
  exerciseId: string;
  exerciseName: string;
  bodyPart: string;
  equipment: string;
  completed: boolean;
  skipped: boolean;
  setsCompleted: number;
  targetSets: number;
  repsCompleted: number;
  targetReps: string;
  weightUsed: number;
  previousWeight: number;
  rpe: number | null;
  difficulty: number | null;
  pain: string | null;
  painLevel: number | null;
  setData: Array<{ setNumber: number; reps: number; weight: number }>;
  notes: string;
}

export interface WorkoutPerformance {
  workoutId: string;
  planId: string;
  planVersion: number;
  weekNumber: number;
  day: string;
  completedAt: string;
  completionStatus: CompletionStatus;
  completionPercentage: number;
  duration: number;
  totalExercises: number;
  completedExercises: number;
  skippedExercises: number;
  totalSets: number;
  totalReps: number;
  totalWeight: number;
  caloriesBurned: number;
  intensity: number;
  prAchieved: boolean;
  exercises: ExercisePerformance[];
  notes: string;
}

export interface PlanVersion {
  planId: string;
  userId: string;
  version: number;
  weekNumber: number;
  status: "active" | "completed" | "archived";
  plan: Record<string, unknown>;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  completedAt: string | null;
  previousPlanId: string | null;
  nextPlanId: string | null;
  createdAt: string;
}

export type ProgressionRecommendation =
  | "increase"
  | "maintain"
  | "decrease"
  | "substitute"
  | "skip"
  | "increase_weight"
  | "decrease_weight"
  | "decrease_reps"
  | "skip_progression";

export interface ExerciseWeekAnalysis {
  exerciseId: string;
  exerciseName: string;
  bodyPart: string;
  timesPerformed: number;
  timesSkipped: number;
  avgWeight: number;
  maxWeight: number;
  previousWeight: number;
  weightChange: number;
  avgReps: number;
  targetReps: string;
  avgRpe: number | null;
  avgDifficulty: number | null;
  painReports: number;
  painDetails: string[];
  progressionRecommendation: ProgressionRecommendation;
  recommendationReason: string;
}

export interface WeekAnalysis {
  userId: string;
  planId: string;
  planVersion: number;
  weekNumber: number;
  analyzedAt: string;
  totalPlannedWorkouts: number;
  completedWorkouts: number;
  skippedWorkouts: number;
  partialWorkouts: number;
  completionPercentage: number;
  totalDuration: number;
  totalWeight: number;
  totalReps: number;
  avgRpe: number | null;
  avgDifficulty: number | null;
  painReports: number;
  exercises: ExerciseWeekAnalysis[];
  overallRecommendation: "progress" | "maintain" | "regress" | "rest";
  recommendationReason: string;
}

export type ProgressionAdjustment =
  | { type: "increase_weight"; exerciseId: string; newWeight: number; reason: string }
  | { type: "increase_reps"; exerciseId: string; newReps: string; reason: string }
  | { type: "decrease_weight"; exerciseId: string; newWeight: number; reason: string }
  | { type: "decrease_reps"; exerciseId: string; newReps: string; reason: string }
  | { type: "substitute_exercise"; exerciseId: string; newExerciseId: string; reason: string }
  | { type: "remove_exercise"; exerciseId: string; reason: string }
  | { type: "maintain"; exerciseId: string; reason: string }
  | { type: "skip_progression"; exerciseId: string; reason: string };

export interface ProgressionResult {
  planId: string;
  previousPlanId: string;
  weekNumber: number;
  adjustments: ProgressionAdjustment[];
  safetyFlags: string[];
  requiresManualReview: boolean;
}
