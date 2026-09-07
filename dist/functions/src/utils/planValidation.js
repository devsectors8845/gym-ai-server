"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGeneratedPlan = validateGeneratedPlan;
const v2_1 = require("firebase-functions/v2");
const exerciseCatalog_1 = require("../data/exerciseCatalog");
const goals_1 = require("../constants/goals");
const exerciseSelectionService_1 = require("../services/exerciseSelectionService");
const planBuilder_1 = require("../services/planBuilder");
/**
 * Step 8's validation layer: `Generate -> Validate -> Save`, never
 * `Generate -> Save -> Hope it's valid`. `functions/generateWorkoutPlan.ts`
 * calls this on every plan before writing to Firestore and refuses to save
 * (`WorkoutEngineError("invalid_plan")`) if it fails — see that file.
 *
 * This checks every category the task specifies: user constraints, exercise
 * constraints, workout-structure constraints, and plan-integrity fields.
 * It re-derives safety (equipment/experience/limitation) per exercise
 * independently from the exact predicates `exerciseSelectionService.ts`
 * used to pick them, so a bug that let an unsafe exercise slip through
 * selection would still be caught here rather than silently saved.
 */
function validateGeneratedPlan(plan, profile, uid) {
    const errors = [];
    // ---- Plan integrity ----
    if (!uid)
        errors.push("Missing user id.");
    if (!plan.planId)
        errors.push("Plan is missing a planId.");
    if (plan.schemaVersion !== planBuilder_1.PLAN_SCHEMA_VERSION) {
        errors.push(`Unexpected schema version: ${plan.schemaVersion}.`);
    }
    if (!plan.generatedAt || Number.isNaN(Date.parse(plan.generatedAt))) {
        errors.push("Plan is missing a valid generation timestamp.");
    }
    // ---- User constraints ----
    if (!goals_1.GOAL_STRATEGIES[profile.goal])
        errors.push(`Unsupported goal: ${profile.goal}.`);
    if (!["beginner", "intermediate", "advanced"].includes(profile.experience)) {
        errors.push(`Unsupported experience level: ${profile.experience}.`);
    }
    if (!profile.equipment || profile.equipment.length === 0) {
        errors.push("No equipment resolved for this profile.");
    }
    if (profile.frequencyDays < 1 || profile.frequencyDays > 7) {
        errors.push(`Invalid workout frequency: ${profile.frequencyDays}.`);
    }
    // ---- Workout-structure constraints ----
    const dayKeys = Object.keys(plan.daily_workouts);
    if (dayKeys.length !== profile.frequencyDays) {
        errors.push(`Plan has ${dayKeys.length} day(s) but the profile calls for ${profile.frequencyDays}.`);
    }
    const restDayKeys = new Set(plan.weekly_split
        .filter((entry) => entry.endsWith(": Rest"))
        .map((entry) => entry.split(":")[0]));
    let strategy;
    try {
        strategy = (0, goals_1.getGoalStrategy)(profile.goal);
    }
    catch {
        strategy = undefined;
    }
    for (const dayKey of dayKeys) {
        const exercises = plan.daily_workouts[dayKey];
        const isRestDay = restDayKeys.has(dayKey);
        if (!isRestDay && (!Array.isArray(exercises) || exercises.length === 0)) {
            errors.push(`${dayKey} has no exercises and is not a designated rest day.`);
            continue;
        }
        for (const exercise of exercises) {
            const catalogEntry = (0, exerciseCatalog_1.getCatalogById)(exercise.id);
            if (!catalogEntry) {
                errors.push(`${dayKey}: exercise id "${exercise.id}" does not exist in the catalog.`);
                continue;
            }
            if (!(0, exerciseSelectionService_1.passesEquipment)(catalogEntry, profile)) {
                errors.push(`${dayKey}: "${catalogEntry.name}" requires equipment the user doesn't have.`);
            }
            if (strategy && !(0, exerciseSelectionService_1.passesExperience)(catalogEntry, profile, strategy)) {
                errors.push(`${dayKey}: "${catalogEntry.name}" is not appropriate for a ${profile.experience} user.`);
            }
            if (!(0, exerciseSelectionService_1.passesLimitations)(catalogEntry, profile)) {
                errors.push(`${dayKey}: "${catalogEntry.name}" is contraindicated for the user's reported limitation(s).`);
            }
        }
    }
    const valid = errors.length === 0;
    if (!valid) {
        // Observable failure (Step 9) — never a plan that silently gets saved
        // anyway. `generateWorkoutPlan.ts` is responsible for actually blocking
        // the save; this function only reports.
        v2_1.logger.error("workoutPlan.validation_failed", { uid, goal: profile.goal, errors });
    }
    return { valid, errors };
}
//# sourceMappingURL=planValidation.js.map