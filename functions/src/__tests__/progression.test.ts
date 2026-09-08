import { calculateProgression } from "../services/progressionService";
import { WeekAnalysis, ExerciseWeekAnalysis } from "../types/history";
import { GeneratedPlan } from "../types/workout";
import { NormalizedProfile } from "../types/workout";

function buildMockPlan(planId: string, weekNumber: number): GeneratedPlan {
  return {
    planId,
    schemaVersion: 1,
    userProfile: {
      name: "Test User",
      age: 30,
      gender: "Male",
      height: "175cm",
      weight: "70kg",
      goal: "muscle_gain",
      experience: "intermediate",
      equipment: ["dumbbell", "barbell"],
      weekly_workouts: 4,
      limitations: [],
    },
    goal: "muscle_gain",
    weekly_split: ["Day 1: Push", "Day 2: Pull", "Day 3: Legs", "Day 4: Upper Body"],
    daily_workouts: {
      "Day 1": [
        { id: "ex-1", name: "Bench Press", bodyPart: "chest", equipment: "barbell", sets: 4, reps: "8-12", restSeconds: 90 },
        { id: "ex-2", name: "Squat", bodyPart: "legs", equipment: "barbell", sets: 4, reps: "8-12", restSeconds: 90 },
      ],
      "Day 2": [
        { id: "ex-3", name: "Pull-Up", bodyPart: "back", equipment: "bodyweight", sets: 4, reps: "8-12", restSeconds: 90 },
      ],
      "Day 3": [
        { id: "ex-4", name: "Overhead Press", bodyPart: "shoulders", equipment: "barbell", sets: 4, reps: "8-12", restSeconds: 90 },
      ],
      "Day 4": [
        { id: "ex-5", name: "Deadlift", bodyPart: "legs", equipment: "barbell", sets: 4, reps: "8-12", restSeconds: 90 },
      ],
    },
    warmup: [],
    cooldown: [],
    workout_guidelines: [],
    recovery: [],
    nutrition: { calorieDirection: "maintenance", proteinGramsPerKg: 1.8, notes: [] },
    generatedAt: new Date().toISOString(),
    source: "Deterministic Workout Engine",
    weekNumber,
    previousPlanId: null,
  };
}

function buildMockAnalysis(exercises: ExerciseWeekAnalysis[]): WeekAnalysis {
  return {
    userId: "uid-test",
    planId: "plan-1",
    planVersion: 1,
    weekNumber: 1,
    analyzedAt: new Date().toISOString(),
    totalPlannedWorkouts: 4,
    completedWorkouts: 4,
    skippedWorkouts: 0,
    partialWorkouts: 0,
    completionPercentage: 100,
    totalDuration: 3600,
    totalWeight: 10000,
    totalReps: 160,
    avgRpe: 6,
    avgDifficulty: 3,
    painReports: 0,
    exercises,
    overallRecommendation: "progress",
    recommendationReason: "Good performance",
  };
}

const mockProfile: NormalizedProfile = {
  goal: "muscle_gain",
  experience: "intermediate",
  equipment: ["dumbbell", "barbell"],
  frequencyDays: 4,
  limitations: [],
  age: 30,
  gender: "Male",
  heightCm: 175,
  weightKg: 70,
  fullName: "Test User",
};

describe("progressionService — calculateProgression", () => {
  it("produces progression adjustments for a successful week", () => {
    const exercises: ExerciseWeekAnalysis[] = [
      {
        exerciseId: "ex-1",
        exerciseName: "Bench Press",
        bodyPart: "chest",
        timesPerformed: 2,
        timesSkipped: 0,
        avgWeight: 45,
        maxWeight: 45,
        previousWeight: 40,
        weightChange: 5,
        avgReps: 10,
        targetReps: "8-12",
        avgRpe: 6,
        avgDifficulty: 3,
        painReports: 0,
        painDetails: [],
        progressionRecommendation: "increase_weight",
        recommendationReason: "Weight increased successfully with manageable RPE",
      },
    ];

    const analysis = buildMockAnalysis(exercises);
    const plan = buildMockPlan("plan-1", 1);
    const result = calculateProgression(analysis, plan, mockProfile);

    expect(result.previousPlanId).toBe("plan-1");
    expect(result.weekNumber).toBe(2);
    expect(result.adjustments.length).toBeGreaterThan(0);
    expect(result.safetyFlags).toEqual([]);
    expect(result.requiresManualReview).toBe(false);
  });

  it("flags substitute when pain is reported", () => {
    const exercises: ExerciseWeekAnalysis[] = [
      {
        exerciseId: "ex-2",
        exerciseName: "Squat",
        bodyPart: "legs",
        timesPerformed: 1,
        timesSkipped: 0,
        avgWeight: 60,
        maxWeight: 60,
        previousWeight: 60,
        weightChange: 0,
        avgReps: 8,
        targetReps: "8-12",
        avgRpe: 7,
        avgDifficulty: 4,
        painReports: 1,
        painDetails: ["Knee discomfort"],
        progressionRecommendation: "substitute",
        recommendationReason: "Pain/discomfort reported — substitute with a safer alternative",
      },
    ];

    const analysis = buildMockAnalysis(exercises);
    const plan = buildMockPlan("plan-2", 2);
    const result = calculateProgression(analysis, plan, mockProfile);

    const substituteAdjustment = result.adjustments.find(
      (a) => a.type === "substitute_exercise" && a.exerciseId === "ex-2"
    );
    expect(substituteAdjustment).toBeDefined();
    expect(result.safetyFlags.length).toBeGreaterThan(0);
  });

  it("recommends decrease_weight when RPE is very high", () => {
    const exercises: ExerciseWeekAnalysis[] = [
      {
        exerciseId: "ex-4",
        exerciseName: "Overhead Press",
        bodyPart: "shoulders",
        timesPerformed: 2,
        timesSkipped: 0,
        avgWeight: 30,
        maxWeight: 30,
        previousWeight: 30,
        weightChange: 0,
        avgReps: 6,
        targetReps: "8-12",
        avgRpe: 9,
        avgDifficulty: 5,
        painReports: 0,
        painDetails: [],
        progressionRecommendation: "decrease_weight",
        recommendationReason: "Very high RPE reported — reduce load to maintain form",
      },
    ];

    const analysis = buildMockAnalysis(exercises);
    const plan = buildMockPlan("plan-3", 3);
    const result = calculateProgression(analysis, plan, mockProfile);

    const decreaseAdjustment = result.adjustments.find(
      (a) => a.type === "decrease_weight" && a.exerciseId === "ex-4"
    );
    expect(decreaseAdjustment).toBeDefined();
    expect((decreaseAdjustment as { newWeight: number }).newWeight).toBeLessThan(30);
  });

  it("skips progression when no performance data exists", () => {
    const exercises: ExerciseWeekAnalysis[] = [
      {
        exerciseId: "ex-5",
        exerciseName: "Deadlift",
        bodyPart: "legs",
        timesPerformed: 0,
        timesSkipped: 0,
        avgWeight: 0,
        maxWeight: 0,
        previousWeight: 0,
        weightChange: 0,
        avgReps: 0,
        targetReps: "8-12",
        avgRpe: null,
        avgDifficulty: null,
        painReports: 0,
        painDetails: [],
        progressionRecommendation: "skip_progression",
        recommendationReason: "No performance data available for this exercise",
      },
    ];

    const analysis = buildMockAnalysis(exercises);
    const plan = buildMockPlan("plan-4", 4);
    const result = calculateProgression(analysis, plan, mockProfile);

    const skipAdjustment = result.adjustments.find(
      (a) => a.type === "skip_progression" && a.exerciseId === "ex-5"
    );
    expect(skipAdjustment).toBeDefined();
  });

  it("sets requiresManualReview when more than 3 safety flags exist", () => {
    const extraExercises = Array.from({ length: 3 }, (_, idx) => ({
      exerciseId: `ex-${idx + 2}`,
      exerciseName: `Extra Exercise ${idx}`,
      bodyPart: "chest" as const,
      timesPerformed: 1,
      timesSkipped: 0,
      avgWeight: 40,
      maxWeight: 40,
      previousWeight: 40,
      weightChange: 0,
      avgReps: 8,
      targetReps: "8-12",
      avgRpe: 7,
      avgDifficulty: 3,
      painReports: 1,
      painDetails: ["Pain reported"],
      progressionRecommendation: "substitute" as const,
      recommendationReason: "Pain reported",
    }));

    const exercises: ExerciseWeekAnalysis[] = [
      {
        exerciseId: "ex-1",
        exerciseName: "Main Exercise",
        bodyPart: "chest",
        timesPerformed: 1,
        timesSkipped: 0,
        avgWeight: 40,
        maxWeight: 40,
        previousWeight: 40,
        weightChange: 0,
        avgReps: 8,
        targetReps: "8-12",
        avgRpe: 7,
        avgDifficulty: 3,
        painReports: 1,
        painDetails: ["Pain reported"],
        progressionRecommendation: "substitute",
        recommendationReason: "Pain reported",
      },
      ...extraExercises,
    ];

    const analysis = buildMockAnalysis(exercises);
    const plan = buildMockPlan("plan-5", 5);
    const result = calculateProgression(analysis, plan, mockProfile);

    expect(result.requiresManualReview).toBe(true);
  });
});
