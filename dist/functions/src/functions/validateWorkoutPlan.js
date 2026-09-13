"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateWorkoutPlanHandler = validateWorkoutPlanHandler;
const errors_1 = require("../utils/errors");
const v2_1 = require("firebase-functions/v2");
const userRepository_1 = require("../firestore/userRepository");
const equipment_1 = require("../constants/equipment");
const limitations_1 = require("../constants/limitations");
const exerciseCatalog_1 = require("../data/exerciseCatalog");
const exerciseSelectionService_1 = require("../services/exerciseSelectionService");
const FUNCTION_NAME = "validateWorkoutPlan";
function findCatalogMatchByName(name) {
    const normalized = name.trim().toLowerCase();
    return exerciseCatalog_1.EXERCISE_CATALOG.find((ex) => ex.name.trim().toLowerCase() === normalized);
}
async function validateWorkoutPlanHandler(request) {
    if (!request.auth?.uid) {
        throw new errors_1.HttpError("unauthenticated", "You must be signed in to validate a workout plan.");
    }
    const uid = request.auth.uid;
    const data = request.data;
    if (!data || typeof data !== "object" || !data.dailyWorkouts || typeof data.dailyWorkouts !== "object") {
        throw new errors_1.HttpError("invalid-argument", "A dailyWorkouts object is required.");
    }
    const dailyWorkouts = data.dailyWorkouts;
    const errors = [];
    const warnings = [];
    // Best-effort profile lookup for equipment/limitations. A manual builder
    // can be reached before a full profile exists (e.g. AI generation failed
    // very early) — treat that as "nothing to check against" (warn, don't
    // block), never as "unlimited equipment, no limitations."
    let equipment = [];
    let limitations = [];
    try {
        const rawProfile = await (0, userRepository_1.getUserProfile)(uid);
        if (rawProfile) {
            equipment = (0, equipment_1.resolveEquipment)(rawProfile.availableEquipment);
            limitations = (0, limitations_1.parseLimitations)(rawProfile.modifications);
        }
        else {
            warnings.push("No profile found — equipment and injury checks were skipped.");
        }
    }
    catch (err) {
        v2_1.logger.warn("validateWorkoutPlan.profile_lookup_failed", {
            fn: FUNCTION_NAME,
            uid,
            message: err instanceof Error ? err.message : String(err),
        });
        warnings.push("Could not verify equipment/injury limitations for this check.");
    }
    const dayKeys = Object.keys(dailyWorkouts);
    if (dayKeys.length === 0) {
        errors.push("The plan has no days.");
    }
    let totalExercises = 0;
    for (const dayKey of dayKeys) {
        const exercises = dailyWorkouts[dayKey];
        if (!Array.isArray(exercises)) {
            errors.push(`${dayKey}: exercises must be a list.`);
            continue;
        }
        for (const exercise of exercises) {
            const name = typeof exercise?.name === "string" ? exercise.name.trim() : "";
            if (!name) {
                errors.push(`${dayKey}: an exercise is missing a name.`);
                continue;
            }
            totalExercises++;
            const match = findCatalogMatchByName(name);
            if (!match) {
                warnings.push(`"${name}" (${dayKey}) is a custom exercise and wasn't automatically checked against your equipment or injury notes.`);
                continue;
            }
            const fakeProfile = { equipment, limitations };
            if (equipment.length > 0 && !(0, exerciseSelectionService_1.passesEquipment)(match, fakeProfile)) {
                errors.push(`"${match.name}" (${dayKey}) requires equipment you haven't marked as available.`);
            }
            if (limitations.length > 0 && !(0, exerciseSelectionService_1.passesLimitations)(match, fakeProfile)) {
                errors.push(`"${match.name}" (${dayKey}) is contraindicated for a limitation you reported (${match.contraindications.join(", ")}). Consider one of: ${match.alternatives.join(", ") || "a different exercise"}.`);
            }
        }
    }
    if (totalExercises === 0) {
        errors.push("The plan has no exercises.");
    }
    const valid = errors.length === 0;
    v2_1.logger.info("validateWorkoutPlan.checked", { fn: FUNCTION_NAME, uid, valid, errorCount: errors.length });
    return { valid, errors, warnings };
}
//# sourceMappingURL=validateWorkoutPlan.js.map