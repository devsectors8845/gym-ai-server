import {
  analyzeWorkoutWeek,
  determineProgressionRecommendation,
  determineOverallRecommendation,
} from "../services/weekAnalysisService";

jest.mock("../firestore/userRepository", () => ({
  getRecentWorkoutHistory: jest.fn(),
  getExerciseWeightHistory: jest.fn(),
}));

import { getRecentWorkoutHistory, getExerciseWeightHistory } from "../firestore/userRepository";

const mockedGetRecentWorkoutHistory = getRecentWorkoutHistory as jest.MockedFunction<typeof getRecentWorkoutHistory>;
const mockedGetExerciseWeightHistory = getExerciseWeightHistory as jest.MockedFunction<typeof getExerciseWeightHistory>;

describe("weekAnalysisService — analyzeWorkoutWeek", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetRecentWorkoutHistory.mockResolvedValue([]);
    mockedGetExerciseWeightHistory.mockResolvedValue(undefined);
  });

  it("returns 0% completion when no workouts exist for the plan", async () => {
    const analysis = await analyzeWorkoutWeek("uid-test", "plan-1", 1);
    expect(analysis.completionPercentage).toBe(0);
    expect(analysis.totalPlannedWorkouts).toBe(0);
    expect(analysis.completedWorkouts).toBe(0);
    expect(analysis.exercises).toEqual([]);
    expect(analysis.overallRecommendation).toBe("regress");
  });

  it("calculates completion percentage correctly with mixed workout statuses", async () => {
    mockedGetRecentWorkoutHistory.mockResolvedValueOnce([
      {
        planId: "plan-2",
        weekNumber: 2,
        completionStatus: "completed",
        duration: 3600,
        totalWeight: 5000,
        totalReps: 80,
        exercises: [
          { exerciseId: "ex-1", exerciseName: "Bench Press", completed: true, skipped: false, weightUsed: 40, repsCompleted: 10, rpe: 6, difficulty: 3, pain: null, targetReps: "8-12" },
        ],
      },
      {
        planId: "plan-2",
        weekNumber: 2,
        completionStatus: "skipped",
        duration: 0,
        totalWeight: 0,
        totalReps: 0,
        exercises: [],
      },
    ]);

    const analysis = await analyzeWorkoutWeek("uid-test", "plan-2", 2);
    expect(analysis.completionPercentage).toBeGreaterThanOrEqual(0);
    expect(analysis.completionPercentage).toBeLessThanOrEqual(100);
  });

  it("identifies overall recommendation based on completion and RPE", async () => {
    mockedGetRecentWorkoutHistory.mockResolvedValueOnce([
      {
        planId: "plan-3",
        weekNumber: 3,
        completionStatus: "completed",
        duration: 3600,
        totalWeight: 5000,
        totalReps: 80,
        exercises: [
          { exerciseId: "ex-1", exerciseName: "Bench Press", completed: true, skipped: false, weightUsed: 40, repsCompleted: 10, rpe: 6, difficulty: 3, pain: null, targetReps: "8-12" },
        ],
      },
    ]);

    const analysis = await analyzeWorkoutWeek("uid-test", "plan-3", 3);
    expect(["progress", "maintain", "regress", "rest"]).toContain(
      analysis.overallRecommendation
    );
    expect(analysis.recommendationReason.length).toBeGreaterThan(0);
  });

  it("includes exercise-level analysis when performance data exists", async () => {
    mockedGetRecentWorkoutHistory.mockResolvedValueOnce([
      {
        planId: "plan-4",
        weekNumber: 4,
        completionStatus: "completed",
        duration: 3600,
        totalWeight: 5000,
        totalReps: 80,
        exercises: [
          { exerciseId: "ex-1", exerciseName: "Bench Press", completed: true, skipped: false, weightUsed: 40, repsCompleted: 10, rpe: 6, difficulty: 3, pain: null, targetReps: "8-12" },
        ],
      },
    ]);

    const analysis = await analyzeWorkoutWeek("uid-test", "plan-4", 4);
    expect(Array.isArray(analysis.exercises)).toBe(true);
  });
});

describe("weekAnalysisService — determineProgressionRecommendation", () => {
  it("recommends substitute when pain is reported", () => {
    const result = determineProgressionRecommendation(
      1,
      0,
      40,
      40,
      6,
      3,
      1
    );
    expect(result.recommendation).toBe("substitute");
    expect(result.reason).toContain("Pain");
  });

  it("recommends maintain when exercise is frequently skipped", () => {
    const result = determineProgressionRecommendation(
      1,
      3,
      40,
      40,
      6,
      3,
      0
    );
    expect(result.recommendation).toBe("maintain");
  });

  it("recommends skip_progression when no performance data exists", () => {
    const result = determineProgressionRecommendation(
      0,
      0,
      0,
      0,
      null,
      null,
      0
    );
    expect(result.recommendation).toBe("skip_progression");
  });

  it("recommends decrease_weight when RPE is very high", () => {
    const result = determineProgressionRecommendation(
      2,
      0,
      40,
      40,
      9,
      5,
      0
    );
    expect(result.recommendation).toBe("decrease_weight");
  });

  it("recommends increase_weight when weight increased with manageable RPE", () => {
    const result = determineProgressionRecommendation(
      2,
      0,
      45,
      40,
      6,
      3,
      0
    );
    expect(result.recommendation).toBe("increase_weight");
  });

  it("recommends increase_weight when RPE is low", () => {
    const result = determineProgressionRecommendation(
      2,
      0,
      40,
      40,
      4,
      3,
      0
    );
    expect(result.recommendation).toBe("increase_weight");
  });

  it("recommends maintain in default case", () => {
    const result = determineProgressionRecommendation(
      2,
      0,
      40,
      40,
      7,
      3,
      0
    );
    expect(result.recommendation).toBe("maintain");
  });
});

describe("weekAnalysisService — determineOverallRecommendation", () => {
  it("recommends rest when multiple pain reports exist", () => {
    const result = determineOverallRecommendation(80, 6, 3, 3, 4);
    expect(result.overall).toBe("rest");
  });

  it("recommends progress with high completion and manageable RPE", () => {
    const result = determineOverallRecommendation(90, 6, 3, 0, 4);
    expect(result.overall).toBe("progress");
  });

  it("recommends maintain with good completion rate", () => {
    const result = determineOverallRecommendation(70, 7, 3, 0, 4);
    expect(result.overall).toBe("maintain");
  });

  it("recommends regress with low completion rate", () => {
    const result = determineOverallRecommendation(20, 6, 3, 0, 4);
    expect(result.overall).toBe("regress");
  });

  it("recommends maintain with high difficulty", () => {
    const result = determineOverallRecommendation(70, 6, 5, 0, 4);
    expect(result.overall).toBe("maintain");
  });
});
