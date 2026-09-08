import { buildSafePool, selectExercisesForBodyPart, pickFromPool } from "../services/exerciseSelectionService";
import { getGoalStrategy } from "../constants/goals";
import { mulberry32 } from "../utils/seededRandom";
import { NormalizedProfile } from "../types/workout";
import { WorkoutEngineError } from "../utils/workoutErrors";
import { getCatalogById } from "../data/exerciseCatalog";

function makeProfile(overrides: Partial<NormalizedProfile> = {}): NormalizedProfile {
  return {
    goal: "muscle_gain",
    experience: "intermediate",
    equipment: ["full_gym"],
    frequencyDays: 3,
    limitations: [],
    age: 30,
    gender: "Male",
    heightCm: 180,
    weightKg: 80,
    fullName: "Test User",
    ...overrides,
  };
}

describe("Injury/limitation filtering (Step 4)", () => {
  it("excludes a contraindicated knee exercise from the legs pool", () => {
    const profile = makeProfile({ limitations: ["knee"] });
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("legs", profile, strategy);
    const squat = getCatalogById("barbell_back_squat")!;
    expect(pool.find((ex) => ex.id === squat.id)).toBeUndefined();
    expect(squat.contraindications).toContain("knee");
  });

  it("still returns a safe, non-empty pool via approved alternatives when direct options are excluded", () => {
    // Full gym + knee limitation should still leave leg-press/leg-extension/etc alternatives.
    const profile = makeProfile({ limitations: ["knee"] });
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("legs", profile, strategy);
    expect(pool.length).toBeGreaterThan(0);
    pool.forEach((ex) => expect(ex.contraindications).not.toContain("knee"));
  });

  it("excludes a contraindicated shoulder exercise", () => {
    const profile = makeProfile({ limitations: ["shoulder"] });
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("shoulders", profile, strategy);
    pool.forEach((ex) => expect(ex.contraindications).not.toContain("shoulder"));
  });

  it("throws empty_pool rather than silently returning an unsafe or empty result when truly nothing is safe", () => {
    // Bodyweight-only + every limitation this catalog has contraindications for.
    const profile = makeProfile({
      equipment: ["bodyweight"],
      limitations: ["knee", "shoulder", "lower_back", "wrist", "ankle", "hip", "neck", "elbow"],
    });
    const strategy = getGoalStrategy(profile.goal);
    expect(() => selectExercisesForBodyPart("core", 2, profile, strategy, mulberry32(1), new Set())).not.toThrow();
    // arms body part with bodyweight equipment has zero catalog entries at all (all arm exercises require equipment) -> must throw, not silently produce an empty day.
    expect(() =>
      selectExercisesForBodyPart("arms", 2, profile, strategy, mulberry32(1), new Set())
    ).toThrow(WorkoutEngineError);
  });
});

describe("Equipment filtering (Step 5)", () => {
  it("never selects a barbell exercise for a dumbbell-only user", () => {
    const profile = makeProfile({ equipment: ["dumbbell"] });
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("chest", profile, strategy);
    pool.forEach((ex) => expect(ex.equipment).not.toBe("barbell"));
  });

  it("bodyweight-only users only get bodyweight exercises", () => {
    const profile = makeProfile({ equipment: ["bodyweight"] });
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("core", profile, strategy);
    pool.forEach((ex) => expect(ex.equipment).toBe("bodyweight"));
  });

  it("full_gym allows any equipment type", () => {
    const profile = makeProfile({ equipment: ["full_gym"] });
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("back", profile, strategy);
    const equipmentTypesSeen = new Set(pool.map((ex) => ex.equipment));
    expect(equipmentTypesSeen.size).toBeGreaterThan(1);
  });
});

describe("Experience gating", () => {
  it("never gives a beginner a plyometric or advanced-difficulty exercise", () => {
    const profile = makeProfile({ experience: "beginner", goal: "athletic_performance" });
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("legs", profile, strategy);
    pool.forEach((ex) => {
      expect(ex.movementType).not.toBe("plyometric");
      expect(ex.difficulty).toBe("beginner");
    });
  });

  it("only offers plyometric movements when the goal allows them and the user isn't a beginner", () => {
    const profile = makeProfile({ experience: "advanced", goal: "athletic_performance" });
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("cardio", profile, strategy);
    // at least possible to include plyometric now (not guaranteed by pool alone, but none should be excluded purely for being plyometric)
    expect(pool.some((ex) => ex.movementType === "plyometric" || ex.movementType === "cardio")).toBe(true);
  });

  it("a goal that never allows plyometric never offers it regardless of experience", () => {
    const profile = makeProfile({ experience: "advanced", goal: "muscle_gain" });
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("legs", profile, strategy);
    pool.forEach((ex) => expect(ex.movementType).not.toBe("plyometric"));
  });
});

describe("Deterministic selection (Step 10)", () => {
  it("the same pool + same seed produces the same picks", () => {
    const profile = makeProfile();
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("chest", profile, strategy);
    const picksA = pickFromPool(pool, 3, mulberry32(42), new Set());
    const picksB = pickFromPool(pool, 3, mulberry32(42), new Set());
    expect(picksA.map((e) => e.id)).toEqual(picksB.map((e) => e.id));
  });

  it("a different seed can produce a different order/selection", () => {
    const profile = makeProfile();
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("chest", profile, strategy);
    const picksA = pickFromPool(pool, 3, mulberry32(1), new Set());
    const picksB = pickFromPool(pool, 3, mulberry32(999), new Set());
    expect(picksA.map((e) => e.id)).not.toEqual(picksB.map((e) => e.id));
  });

  it("deprioritizes already-used exercises when alternatives exist", () => {
    const profile = makeProfile();
    const strategy = getGoalStrategy(profile.goal);
    const pool = buildSafePool("chest", profile, strategy);
    const used = new Set(pool.slice(0, pool.length - 1).map((ex) => ex.id));
    const picks = pickFromPool(pool, 1, mulberry32(7), used);
    expect(picks[0].id).toBe(pool[pool.length - 1].id);
  });
});
