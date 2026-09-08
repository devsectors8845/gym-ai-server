import { resolveGoal, resolveExperience } from "../constants/goals";
import { resolveEquipment } from "../constants/equipment";
import { parseLimitations } from "../constants/limitations";
import { parseHeightCm, parseWeightKg } from "../utils/units";
import { NormalizedProfile, RawUserProfile } from "../types/workout";
import { WorkoutEngineError } from "../utils/workoutErrors";

/**
 * Step 3's field-by-field mapping, made explicit in code instead of left
 * implicit. Every questionnaire field is accounted for below with the
 * category it falls into (see the final report for the full table):
 *
 *  USED DIRECTLY BY WORKOUT GENERATION: goal, gymExperience,
 *    availableEquipment, weeklyWorkoutCommitment.
 *  USED BY SAFETY/VALIDATION: modifications (parsed into limitation tags).
 *  USED FOR DISPLAY ONLY (not generation logic): age, gender, height,
 *    weight, fullName — shown back to the user in `plan.userProfile` and
 *    used for the nutrition-guidance protein target, but do not change
 *    which exercises are selected.
 *  NOT YET USED BY THIS DETERMINISTIC ENGINE (candidates for future
 *    AI/personalization layers, per Step 3 category 3 — explicitly not
 *    implemented here per Step 14): goalNote, currentPhysique, goalPhysique,
 *    dietaryPreferences, foodAllergies, currentDiet, fitnessChallenge,
 *    sleepHours, waterIntakeLiters, energyLevel.
 */
export function normalizeProfile(raw: RawUserProfile | undefined): NormalizedProfile {
  if (!raw) {
    throw new WorkoutEngineError(
      "missing_profile",
      "No profile document found for this user."
    );
  }

  const goal = resolveGoal(raw.goal);
  const experience = resolveExperience(raw.gymExperience);
  const equipment = resolveEquipment(raw.availableEquipment);
  const limitations = parseLimitations(raw.modifications);

  const frequencyRaw = raw.weeklyWorkoutCommitment;
  const frequencyParsed =
    typeof frequencyRaw === "number" ? frequencyRaw : parseInt(String(frequencyRaw ?? ""), 10);
  if (!Number.isFinite(frequencyParsed) || frequencyParsed < 1 || frequencyParsed > 7) {
    throw new WorkoutEngineError(
      "invalid_frequency",
      `Unsupported weekly workout frequency: ${JSON.stringify(frequencyRaw)}`
    );
  }

  return {
    goal,
    experience,
    equipment,
    frequencyDays: frequencyParsed,
    limitations,
    age: typeof raw.age === "number" ? raw.age : parseInt(String(raw.age ?? ""), 10) || 25,
    gender: typeof raw.gender === "string" && raw.gender.trim() ? raw.gender : "Not specified",
    heightCm: parseHeightCm(raw.height),
    weightKg: parseWeightKg(raw.weight),
    fullName: typeof raw.fullName === "string" && raw.fullName.trim() ? raw.fullName : "User",
  };
}
