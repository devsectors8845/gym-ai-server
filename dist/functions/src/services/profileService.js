"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeProfile = normalizeProfile;
const goals_1 = require("../constants/goals");
const equipment_1 = require("../constants/equipment");
const limitations_1 = require("../constants/limitations");
const units_1 = require("../utils/units");
const workoutErrors_1 = require("../utils/workoutErrors");
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
function normalizeProfile(raw) {
    if (!raw) {
        throw new workoutErrors_1.WorkoutEngineError("missing_profile", "No profile document found for this user.");
    }
    const goal = (0, goals_1.resolveGoal)(raw.goal);
    const experience = (0, goals_1.resolveExperience)(raw.gymExperience);
    const equipment = (0, equipment_1.resolveEquipment)(raw.availableEquipment);
    const limitations = (0, limitations_1.parseLimitations)(raw.modifications);
    const frequencyRaw = raw.weeklyWorkoutCommitment;
    const frequencyParsed = typeof frequencyRaw === "number" ? frequencyRaw : parseInt(String(frequencyRaw ?? ""), 10);
    if (!Number.isFinite(frequencyParsed) || frequencyParsed < 1 || frequencyParsed > 7) {
        throw new workoutErrors_1.WorkoutEngineError("invalid_frequency", `Unsupported weekly workout frequency: ${JSON.stringify(frequencyRaw)}`);
    }
    return {
        goal,
        experience,
        equipment,
        frequencyDays: frequencyParsed,
        limitations,
        age: typeof raw.age === "number" ? raw.age : parseInt(String(raw.age ?? ""), 10) || 25,
        gender: typeof raw.gender === "string" && raw.gender.trim() ? raw.gender : "Not specified",
        heightCm: (0, units_1.parseHeightCm)(raw.height),
        weightKg: (0, units_1.parseWeightKg)(raw.weight),
        fullName: typeof raw.fullName === "string" && raw.fullName.trim() ? raw.fullName : "User",
    };
}
//# sourceMappingURL=profileService.js.map