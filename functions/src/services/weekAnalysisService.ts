import { WorkoutPerformance, ExerciseWeekAnalysis, WeekAnalysis } from "../types/history";
import { getRecentWorkoutHistory, getExerciseWeightHistory } from "../firestore/userRepository";

export async function analyzeWorkoutWeek(
  uid: string,
  planId: string,
  weekNumber: number
): Promise<WeekAnalysis> {
  const workouts = await getRecentWorkoutHistory(uid, 100);

  const planWorkouts = workouts.filter((w) => {
    const perf = w as unknown as WorkoutPerformance;
    return perf.planId === planId && perf.weekNumber === weekNumber;
  });

  const totalPlanned = planWorkouts.length > 0 ? planWorkouts.length : 0;
  const completed = planWorkouts.filter((w) => {
    const perf = w as unknown as WorkoutPerformance;
    return perf.completionStatus === "completed";
  }).length;
  const skipped = planWorkouts.filter((w) => {
    const perf = w as unknown as WorkoutPerformance;
    return perf.completionStatus === "skipped";
  }).length;
  const partial = planWorkouts.filter((w) => {
    const perf = w as unknown as WorkoutPerformance;
    return perf.completionStatus === "partial";
  }).length;

  const completionPct =
    totalPlanned > 0 ? Math.round(((completed + partial * 0.5) / totalPlanned) * 100) : 0;

  const totalDuration = planWorkouts.reduce((sum, w) => {
    const perf = w as unknown as WorkoutPerformance;
    return sum + (perf.duration || 0);
  }, 0);

  const totalWeight = planWorkouts.reduce((sum, w) => {
    const perf = w as unknown as WorkoutPerformance;
    return sum + (perf.totalWeight || 0);
  }, 0);

  const totalReps = planWorkouts.reduce((sum, w) => {
    const perf = w as unknown as WorkoutPerformance;
    return sum + (perf.totalReps || 0);
  }, 0);

  const allExercises: WorkoutPerformance["exercises"] = [];
  planWorkouts.forEach((w) => {
    const perf = w as unknown as WorkoutPerformance;
    if (Array.isArray(perf.exercises)) {
      allExercises.push(...perf.exercises);
    }
  });

  const exerciseMap = new Map<string, WorkoutPerformance["exercises"]>();
  allExercises.forEach((ex) => {
    if (!exerciseMap.has(ex.exerciseId)) {
      exerciseMap.set(ex.exerciseId, []);
    }
    exerciseMap.get(ex.exerciseId)!.push(ex);
  });

  const exerciseAnalyses: ExerciseWeekAnalysis[] = [];
  for (const [exerciseId, exercises] of exerciseMap.entries()) {
    const performed = exercises.filter((e) => e.completed);
    const skipped = exercises.filter((e) => e.skipped);
    const weights = performed.map((e) => e.weightUsed).filter((w) => w > 0);
    const reps = performed.map((e) => e.repsCompleted).filter((r) => r > 0);
    const rpes = performed.map((e) => e.rpe).filter((r) => r !== null) as number[];
    const difficulties = performed
      .map((e) => e.difficulty)
      .filter((d) => d !== null) as number[];
    const painEntries = performed.filter((e) => e.pain && e.pain.length > 0);

    const avgWeight = weights.length > 0 ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length) : 0;
    const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;
    const avgReps = reps.length > 0 ? Math.round(reps.reduce((a, b) => a + b, 0) / reps.length) : 0;
    const avgRpe = rpes.length > 0 ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;
    const avgDifficulty =
      difficulties.length > 0
        ? Math.round((difficulties.reduce((a, b) => a + b, 0) / difficulties.length) * 10) / 10
        : null;

    const targetReps = performed[0]?.targetReps || "8-12";
    const previousWeightData = await getExerciseWeightHistory(uid, exerciseId);
    const previousWeight = previousWeightData?.currentPR || 0;

    const { recommendation, reason } = determineProgressionRecommendation(
      performed.length,
      skipped.length,
      avgWeight,
      previousWeight,
      avgRpe,
      avgDifficulty,
      painEntries.length
    );

    exerciseAnalyses.push({
      exerciseId,
      exerciseName: exercises[0]?.exerciseName || "Unknown",
      bodyPart: exercises[0]?.bodyPart || "Unknown",
      timesPerformed: performed.length,
      timesSkipped: skipped.length,
      avgWeight,
      maxWeight,
      previousWeight,
      weightChange: avgWeight - previousWeight,
      avgReps,
      targetReps,
      avgRpe,
      avgDifficulty,
      painReports: painEntries.length,
      painDetails: painEntries.map((p) => p.pain).filter((p): p is string => Boolean(p)),
      progressionRecommendation: recommendation,
      recommendationReason: reason,
    });
  }

  const allRpes = allExercises
    .map((e) => e.rpe)
    .filter((r) => r !== null) as number[];
  const allDifficulties = allExercises
    .map((e) => e.difficulty)
    .filter((d) => d !== null) as number[];
  const allPain = allExercises.filter((e) => e.pain && e.pain.length > 0);

  const avgRpe = allRpes.length > 0 ? Math.round((allRpes.reduce((a, b) => a + b, 0) / allRpes.length) * 10) / 10 : null;
  const avgDifficulty =
    allDifficulties.length > 0
      ? Math.round((allDifficulties.reduce((a, b) => a + b, 0) / allDifficulties.length) * 10) / 10
      : null;

  const { overall: overallRec, reason: overallReason } = determineOverallRecommendation(
    completionPct,
    avgRpe,
    avgDifficulty,
    allPain.length,
    totalPlanned
  );

  return {
    userId: uid,
    planId,
    planVersion: weekNumber,
    weekNumber,
    analyzedAt: new Date().toISOString(),
    totalPlannedWorkouts: totalPlanned,
    completedWorkouts: completed,
    skippedWorkouts: skipped,
    partialWorkouts: partial,
    completionPercentage: completionPct,
    totalDuration,
    totalWeight,
    totalReps,
    avgRpe,
    avgDifficulty,
    painReports: allPain.length,
    exercises: exerciseAnalyses,
    overallRecommendation: overallRec,
    recommendationReason: overallReason,
  };
}

export function determineProgressionRecommendation(
  timesPerformed: number,
  timesSkipped: number,
  avgWeight: number,
  previousWeight: number,
  avgRpe: number | null,
  avgDifficulty: number | null,
  painReports: number
): { recommendation: ExerciseWeekAnalysis["progressionRecommendation"]; reason: string } {
  if (painReports > 0) {
    return {
      recommendation: "substitute",
      reason: "Pain/discomfort reported — substitute with a safer alternative",
    };
  }

  if (timesSkipped > timesPerformed) {
    return {
      recommendation: "maintain",
      reason: "Exercise was frequently skipped — maintain current load",
    };
  }

  if (timesPerformed === 0) {
    return {
      recommendation: "skip_progression",
      reason: "No performance data available for this exercise",
    };
  }

  if (avgRpe !== null && avgRpe >= 9) {
    return {
      recommendation: "decrease_weight",
      reason: "Very high RPE reported — reduce load to maintain form",
    };
  }

  if (avgDifficulty !== null && avgDifficulty >= 4.5) {
    return {
      recommendation: "decrease_reps",
      reason: "Very high difficulty reported — reduce volume",
    };
  }

  if (avgWeight > previousWeight && avgRpe !== null && avgRpe <= 7) {
    return {
      recommendation: "increase_weight",
      reason: "Weight increased successfully with manageable RPE",
    };
  }

  if (avgWeight > previousWeight) {
    return {
      recommendation: "maintain",
      reason: "Weight increased but insufficient RPE data — maintain current load",
    };
  }

  if (avgRpe !== null && avgRpe <= 5) {
    return {
      recommendation: "increase_weight",
      reason: "Low RPE indicates capacity to increase load",
    };
  }

  return {
    recommendation: "maintain",
    reason: "Performance was adequate — maintain current parameters",
  };
}

export function determineOverallRecommendation(
  completionPct: number,
  avgRpe: number | null,
  avgDifficulty: number | null,
  painReports: number,
  totalPlanned: number
): { overall: WeekAnalysis["overallRecommendation"]; reason: string } {
  if (painReports > 2) {
    return {
      overall: "rest",
      reason: "Multiple pain reports detected — prioritize recovery and review exercise selection",
    };
  }

  if (completionPct >= 80 && avgRpe !== null && avgRpe <= 7) {
    return {
      overall: "progress",
      reason: "High completion rate with manageable RPE — ready to progress",
    };
  }

  if (completionPct >= 60 && avgRpe !== null && avgRpe <= 8) {
    return {
      overall: "maintain",
      reason: "Good completion rate — maintain current intensity with minor adjustments",
    };
  }

  if (completionPct < 30) {
    return {
      overall: "regress",
      reason: "Low completion rate — reduce intensity to build consistency",
    };
  }

  if (avgDifficulty !== null && avgDifficulty >= 4.5) {
    return {
      overall: "maintain",
      reason: "High difficulty reported — maintain current load to build capacity",
    };
  }

  return {
    overall: "maintain",
    reason: "Mixed performance — maintain current parameters for another week",
  };
}
