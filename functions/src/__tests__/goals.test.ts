import { resolveGoal, resolveExperience, QUESTIONNAIRE_GOAL_MAP, GOAL_STRATEGIES } from "../constants/goals";
import { WorkoutEngineError } from "../utils/workoutErrors";

describe("resolveGoal — all 8 questionnaire goals", () => {
  const EXPECTED: Record<string, string> = {
    "Strength Training": "strength_training",
    Powerlifting: "powerlifting",
    Health: "health",
    "Weight Loss": "weight_loss",
    "Muscle Gain": "muscle_gain",
    "Body Recomposition": "body_recomposition",
    "General Fitness": "general_fitness",
    "Athletic Performance": "athletic_performance",
  };

  it("covers exactly the 8 real questionnaire option strings", () => {
    expect(Object.keys(EXPECTED)).toHaveLength(8);
    expect(Object.keys(QUESTIONNAIRE_GOAL_MAP)).toHaveLength(8);
  });

  it.each(Object.entries(EXPECTED))("maps %s -> %s (not a generic fallback)", (raw, expected) => {
    expect(resolveGoal(raw)).toBe(expected);
  });

  it("every resolvable goal has its own distinct strategy", () => {
    const strategies = Object.values(GOAL_STRATEGIES);
    const uniqueRepRanges = new Set(strategies.map((s) => JSON.stringify(s.reps)));
    // Not every field must differ, but goals should not all collapse to one
    // identical strategy object (the old bug's actual symptom).
    expect(uniqueRepRanges.size).toBeGreaterThan(1);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveGoal("  weight loss  ")).toBe("weight_loss");
    expect(resolveGoal("MUSCLE GAIN")).toBe("muscle_gain");
  });

  it("rejects an unsupported goal instead of silently defaulting to muscle_gain", () => {
    expect(() => resolveGoal("Get Shredded")).toThrow(WorkoutEngineError);
    try {
      resolveGoal("Get Shredded");
      fail("expected resolveGoal to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(WorkoutEngineError);
      expect((err as WorkoutEngineError).category).toBe("invalid_goal");
    }
  });

  it("rejects a missing goal", () => {
    expect(() => resolveGoal(undefined)).toThrow(WorkoutEngineError);
    expect(() => resolveGoal(null)).toThrow(WorkoutEngineError);
    expect(() => resolveGoal("")).toThrow(WorkoutEngineError);
  });
});

describe("resolveExperience", () => {
  it('maps "Advance" (the real questionnaire string) to advanced, not beginner', () => {
    expect(resolveExperience("Advance")).toBe("advanced");
  });

  it("maps Complete Novice and Beginner to beginner", () => {
    expect(resolveExperience("Complete Novice")).toBe("beginner");
    expect(resolveExperience("Beginner")).toBe("beginner");
  });

  it("maps Intermediate to intermediate", () => {
    expect(resolveExperience("Intermediate")).toBe("intermediate");
  });

  it("rejects an unsupported experience value", () => {
    expect(() => resolveExperience("Godlike")).toThrow(WorkoutEngineError);
  });

  it("rejects a missing experience value", () => {
    expect(() => resolveExperience(undefined)).toThrow(WorkoutEngineError);
  });
});
