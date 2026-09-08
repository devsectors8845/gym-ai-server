import { normalizeProfile } from "../services/profileService";
import { WorkoutEngineError } from "../utils/workoutErrors";

const BASE_RAW = {
  goal: "Muscle Gain",
  gymExperience: "Intermediate",
  availableEquipment: ["Dumbells", "Barbell"],
  weeklyWorkoutCommitment: "4",
  modifications: "none",
  age: 28,
  gender: "Male",
  height: "180cm",
  weight: "80kg",
  fullName: "Jordan",
};

describe("normalizeProfile — invalid inputs (Step 9/12)", () => {
  it("throws missing_profile when there is no profile document at all", () => {
    expect(() => normalizeProfile(undefined)).toThrow(WorkoutEngineError);
    try {
      normalizeProfile(undefined);
    } catch (err) {
      expect((err as WorkoutEngineError).category).toBe("missing_profile");
    }
  });

  it("throws invalid_goal on an unknown goal", () => {
    expect(() => normalizeProfile({ ...BASE_RAW, goal: "Get Ripped" })).toThrow(WorkoutEngineError);
  });

  it("throws invalid_goal when goal is missing", () => {
    const { goal, ...rest } = BASE_RAW;
    expect(() => normalizeProfile(rest)).toThrow(WorkoutEngineError);
  });

  it("throws invalid_experience when experience is missing", () => {
    const { gymExperience, ...rest } = BASE_RAW;
    expect(() => normalizeProfile(rest)).toThrow(WorkoutEngineError);
  });

  it("throws invalid_equipment when equipment is missing/empty", () => {
    expect(() => normalizeProfile({ ...BASE_RAW, availableEquipment: [] })).toThrow(WorkoutEngineError);
  });

  it("throws invalid_frequency on a non-numeric or out-of-range frequency", () => {
    expect(() => normalizeProfile({ ...BASE_RAW, weeklyWorkoutCommitment: "not a number" })).toThrow(
      WorkoutEngineError
    );
    expect(() => normalizeProfile({ ...BASE_RAW, weeklyWorkoutCommitment: "0" })).toThrow(WorkoutEngineError);
    expect(() => normalizeProfile({ ...BASE_RAW, weeklyWorkoutCommitment: "8" })).toThrow(WorkoutEngineError);
  });
});

describe("normalizeProfile — valid mapping", () => {
  it("maps a full valid profile correctly", () => {
    const normalized = normalizeProfile(BASE_RAW);
    expect(normalized.goal).toBe("muscle_gain");
    expect(normalized.experience).toBe("intermediate");
    expect(normalized.equipment).toEqual(["dumbbell", "barbell"]);
    expect(normalized.frequencyDays).toBe(4);
    expect(normalized.limitations).toEqual([]);
    expect(normalized.heightCm).toBeCloseTo(180, 0);
    expect(normalized.weightKg).toBeCloseTo(80, 0);
  });

  it("carries a parsed limitation through", () => {
    const normalized = normalizeProfile({ ...BASE_RAW, modifications: "Bad knee, avoid squats" });
    expect(normalized.limitations).toEqual(["knee"]);
  });

  it("falls back to sensible display-only defaults for unparseable age/height/weight rather than failing generation", () => {
    const normalized = normalizeProfile({ ...BASE_RAW, age: "unknown", height: "tall", weight: "a lot" });
    expect(normalized.age).toBe(25);
    expect(normalized.heightCm).toBe(175);
    expect(normalized.weightKg).toBe(70);
  });
});
