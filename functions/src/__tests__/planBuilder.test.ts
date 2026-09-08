import { buildPlan } from "../services/planBuilder";
import { validateGeneratedPlan } from "../utils/planValidation";
import { normalizeProfile } from "../services/profileService";
import { GOAL_STRATEGIES } from "../constants/goals";
import { Goal } from "../types/workout";

const FIXED_NOW = new Date("2026-08-24T00:00:00.000Z");

function rawProfileFor(goal: string, frequency: number) {
  return {
    goal,
    gymExperience: "Intermediate",
    availableEquipment: ["Everything"],
    weeklyWorkoutCommitment: String(frequency),
    modifications: "none",
    age: 30,
    gender: "Female",
    height: "165cm",
    weight: "60kg",
    fullName: "Sam",
  };
}

const ALL_GOALS: Record<string, Goal> = {
  "Strength Training": "strength_training",
  Powerlifting: "powerlifting",
  Health: "health",
  "Weight Loss": "weight_loss",
  "Muscle Gain": "muscle_gain",
  "Body Recomposition": "body_recomposition",
  "General Fitness": "general_fitness",
  "Athletic Performance": "athletic_performance",
};

describe("buildPlan — every goal produces a valid, distinct strategy (Step 2/Step 12)", () => {
  it.each(Object.entries(ALL_GOALS))("goal %s (-> %s) generates a passing plan", (rawGoal, canonicalGoal) => {
    const profile = normalizeProfile(rawProfileFor(rawGoal, 4));
    const plan = buildPlan("uid-goal-test", profile, FIXED_NOW);
    expect(plan.goal).toBe(canonicalGoal);
    const validation = validateGeneratedPlan(plan, profile, "uid-goal-test");
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("Powerlifting uses low reps and long rest; Weight Loss uses high reps and short rest", () => {
    expect(GOAL_STRATEGIES.powerlifting.reps.intermediate[1]).toBeLessThanOrEqual(5);
    expect(GOAL_STRATEGIES.weight_loss.reps.intermediate[1]).toBeGreaterThanOrEqual(12);
    expect(GOAL_STRATEGIES.powerlifting.restSeconds).toBeGreaterThan(GOAL_STRATEGIES.weight_loss.restSeconds);
  });
});

describe("buildPlan — frequency produces the correct number of days (Step 12)", () => {
  it.each([1, 2, 3, 4, 5, 6, 7])("%d days/week produces a %d-day plan", (days) => {
    const profile = normalizeProfile(rawProfileFor("General Fitness", days));
    const plan = buildPlan("uid-freq-test", profile, FIXED_NOW);
    expect(Object.keys(plan.daily_workouts)).toHaveLength(days);
    expect(plan.weekly_split).toHaveLength(days);
  });
});

describe("buildPlan — determinism (Step 10)", () => {
  it("the same profile in the same week produces the same plan", () => {
    const profile = normalizeProfile(rawProfileFor("Muscle Gain", 5));
    const planA = buildPlan("uid-determinism", profile, FIXED_NOW);
    const planB = buildPlan("uid-determinism", profile, FIXED_NOW);
    expect(planA.daily_workouts).toEqual(planB.daily_workouts);
  });

  it("a different user (different uid) with the same profile can get a different plan", () => {
    const profile = normalizeProfile(rawProfileFor("Muscle Gain", 5));
    const planA = buildPlan("uid-1", profile, FIXED_NOW);
    const planB = buildPlan("uid-2", profile, FIXED_NOW);
    expect(planA.daily_workouts).not.toEqual(planB.daily_workouts);
  });

  it("a later week can vary the plan even for the same user/profile", () => {
    const profile = normalizeProfile(rawProfileFor("Muscle Gain", 5));
    const laterWeek = new Date(FIXED_NOW.getTime() + 14 * 24 * 60 * 60 * 1000);
    const planA = buildPlan("uid-week-test", profile, FIXED_NOW);
    const planB = buildPlan("uid-week-test", profile, laterWeek);
    // Not asserting they must differ in every field, but the exercise
    // selections for at least one day are extremely unlikely to be
    // identical by chance across two independent seeds if variety is
    // actually happening.
    expect(planA.daily_workouts).not.toEqual(planB.daily_workouts);
  });
});

describe("buildPlan — injury filtering end-to-end (Step 4/Step 12)", () => {
  it("a knee limitation excludes deep-squat-type movements from the whole plan", () => {
    const raw = { ...rawProfileFor("Muscle Gain", 4), modifications: "Knee pain, avoid deep squats" };
    const profile = normalizeProfile(raw);
    const plan = buildPlan("uid-knee", profile, FIXED_NOW);
    const allExerciseIds = Object.values(plan.daily_workouts)
      .flat()
      .map((ex) => ex.id);
    expect(allExerciseIds).not.toContain("barbell_back_squat");
    expect(allExerciseIds).not.toContain("smith_machine_squat");
    expect(allExerciseIds).not.toContain("box_jump_plyo");
  });

  it("a shoulder limitation excludes overhead/shoulder-loading movements", () => {
    const raw = { ...rawProfileFor("Strength Training", 3), modifications: "Shoulder impingement" };
    const profile = normalizeProfile(raw);
    const plan = buildPlan("uid-shoulder", profile, FIXED_NOW);
    const allExerciseIds = Object.values(plan.daily_workouts)
      .flat()
      .map((ex) => ex.id);
    expect(allExerciseIds).not.toContain("overhead_press_barbell");
    expect(allExerciseIds).not.toContain("dumbbell_shoulder_press");
  });
});

describe("validateGeneratedPlan — rejects a tampered/invalid plan", () => {
  it("flags an invalid exercise id", () => {
    const profile = normalizeProfile(rawProfileFor("General Fitness", 3));
    const plan = buildPlan("uid-tamper", profile, FIXED_NOW);
    const firstDayKey = Object.keys(plan.daily_workouts)[0];
    plan.daily_workouts[firstDayKey][0].id = "not_a_real_exercise";
    const result = validateGeneratedPlan(plan, profile, "uid-tamper");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("does not exist in the catalog"))).toBe(true);
  });

  it("flags an empty non-rest day", () => {
    const profile = normalizeProfile(rawProfileFor("General Fitness", 3));
    const plan = buildPlan("uid-empty-day", profile, FIXED_NOW);
    const firstDayKey = Object.keys(plan.daily_workouts)[0];
    plan.daily_workouts[firstDayKey] = [];
    const result = validateGeneratedPlan(plan, profile, "uid-empty-day");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("no exercises"))).toBe(true);
  });

  it("flags a day-count mismatch", () => {
    const profile = normalizeProfile(rawProfileFor("General Fitness", 3));
    const plan = buildPlan("uid-daycount", profile, FIXED_NOW);
    delete (plan.daily_workouts as Record<string, unknown>)["Day 3"];
    const result = validateGeneratedPlan(plan, profile, "uid-daycount");
    expect(result.valid).toBe(false);
  });
});
