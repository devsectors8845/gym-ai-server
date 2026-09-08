"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateProgression = calculateProgression;
exports.applyProgressionAdjustments = applyProgressionAdjustments;
const exerciseSelectionService_1 = require("./exerciseSelectionService");
const exerciseCatalog_1 = require("../data/exerciseCatalog");
const goals_1 = require("../constants/goals");
const seededRandom_1 = require("../utils/seededRandom");
const WEIGHT_INCREMENT = 2.5;
const WEIGHT_DECREMENT = 2.5;
const MIN_WEIGHT = 0;
function calculateProgression(analysis, previousPlan, profile, now = new Date()) {
    const adjustments = [];
    const safetyFlags = [];
    const exerciseAnalyses = new Map();
    analysis.exercises.forEach((ex) => {
        exerciseAnalyses.set(ex.exerciseId, ex);
    });
    const rng = (0, seededRandom_1.mulberry32)((0, seededRandom_1.hashStringToSeed)(`${previousPlan.planId}|${analysis.planId}|${now.getTime()}`));
    Object.entries(previousPlan.daily_workouts).forEach(([dayKey, exercises]) => {
        exercises.forEach((exercise) => {
            const exAnalysis = exerciseAnalyses.get(exercise.id);
            if (!exAnalysis) {
                adjustments.push({
                    type: "maintain",
                    exerciseId: exercise.id,
                    reason: "No analysis data available",
                });
                return;
            }
            if (exAnalysis.progressionRecommendation === "substitute") {
                safetyFlags.push(`Substituted ${exercise.name} due to pain/discomfort`);
                const substitute = findSubstitute(exercise, profile, rng);
                if (substitute) {
                    adjustments.push({
                        type: "substitute_exercise",
                        exerciseId: exercise.id,
                        newExerciseId: substitute.id,
                        reason: exAnalysis.recommendationReason,
                    });
                }
                else {
                    adjustments.push({
                        type: "remove_exercise",
                        exerciseId: exercise.id,
                        reason: "No safe substitute available",
                    });
                    safetyFlags.push(`Removed ${exercise.name} — no safe alternative`);
                }
                return;
            }
            if (exAnalysis.progressionRecommendation === "skip_progression") {
                adjustments.push({
                    type: "skip_progression",
                    exerciseId: exercise.id,
                    reason: exAnalysis.recommendationReason,
                });
                return;
            }
            if (exAnalysis.progressionRecommendation === "increase_weight") {
                const newWeight = Math.max(MIN_WEIGHT, exAnalysis.avgWeight + WEIGHT_INCREMENT);
                adjustments.push({
                    type: "increase_weight",
                    exerciseId: exercise.id,
                    newWeight,
                    reason: exAnalysis.recommendationReason,
                });
                return;
            }
            if (exAnalysis.progressionRecommendation === "decrease_weight") {
                const newWeight = Math.max(MIN_WEIGHT, exAnalysis.avgWeight - WEIGHT_DECREMENT);
                adjustments.push({
                    type: "decrease_weight",
                    exerciseId: exercise.id,
                    newWeight,
                    reason: exAnalysis.recommendationReason,
                });
                return;
            }
            if (exAnalysis.progressionRecommendation === "decrease_reps") {
                const [minRep, maxRep] = parseRepRange(exercise.reps);
                const newMin = Math.max(1, minRep - 1);
                const newMax = Math.max(newMin, maxRep - 1);
                adjustments.push({
                    type: "decrease_reps",
                    exerciseId: exercise.id,
                    newReps: newMin === newMax ? `${newMin}` : `${newMin}-${newMax}`,
                    reason: exAnalysis.recommendationReason,
                });
                return;
            }
            adjustments.push({
                type: "maintain",
                exerciseId: exercise.id,
                reason: exAnalysis.recommendationReason,
            });
        });
    });
    return {
        planId: `plan_${now.getTime()}`,
        previousPlanId: previousPlan.planId,
        weekNumber: analysis.weekNumber + 1,
        adjustments,
        safetyFlags,
        requiresManualReview: safetyFlags.length > 3,
    };
}
function applyProgressionAdjustments(plan, progression, profile) {
    if (!progression.adjustments || progression.adjustments.length === 0) {
        return plan;
    }
    const adjustmentMap = new Map();
    progression.adjustments.forEach((adj) => {
        adjustmentMap.set(adj.exerciseId, adj);
    });
    const strategy = (0, goals_1.getGoalStrategy)(profile.goal);
    const newDailyWorkouts = {};
    for (const [dayKey, exercises] of Object.entries(plan.daily_workouts)) {
        const newExercises = [];
        for (const exercise of exercises) {
            const adjustment = adjustmentMap.get(exercise.id);
            if (!adjustment || adjustment.type === "maintain" || adjustment.type === "skip_progression") {
                newExercises.push(exercise);
                continue;
            }
            switch (adjustment.type) {
                case "increase_weight":
                case "decrease_weight": {
                    const adjusted = {
                        ...exercise,
                        weight: adjustment.newWeight,
                    };
                    newExercises.push(adjusted);
                    break;
                }
                case "decrease_reps": {
                    const adjusted = {
                        ...exercise,
                        reps: adjustment.newReps,
                    };
                    newExercises.push(adjusted);
                    break;
                }
                case "substitute_exercise": {
                    const substitute = resolveSubstitute(adjustment.newExerciseId, exercise, profile, strategy);
                    if (substitute) {
                        newExercises.push(substitute);
                    }
                    else {
                        newExercises.push(exercise);
                    }
                    break;
                }
                case "remove_exercise": {
                    break;
                }
                default:
                    newExercises.push(exercise);
            }
        }
        newDailyWorkouts[dayKey] = newExercises;
    }
    return {
        ...plan,
        daily_workouts: newDailyWorkouts,
    };
}
function resolveSubstitute(newExerciseId, previousExercise, profile, strategy) {
    try {
        const catalog = (0, exerciseCatalog_1.getCatalogByBodyPart)(previousExercise.bodyPart);
        const candidate = catalog.find((ex) => ex.id === newExerciseId);
        if (!candidate)
            return null;
        if (!(0, exerciseSelectionService_1.passesEquipment)(candidate, profile))
            return null;
        if (!(0, exerciseSelectionService_1.passesExperience)(candidate, profile, strategy))
            return null;
        if (!(0, exerciseSelectionService_1.passesLimitations)(candidate, profile))
            return null;
        const [min, max] = strategy.reps[profile.experience];
        return {
            id: candidate.id,
            name: candidate.name,
            bodyPart: candidate.bodyPart,
            equipment: candidate.equipment,
            sets: strategy.sets[profile.experience],
            reps: min === max ? `${min}` : `${min}-${max}`,
            restSeconds: strategy.restSeconds,
        };
    }
    catch {
        return null;
    }
}
function findSubstitute(exercise, profile, rng) {
    try {
        const strategy = (0, goals_1.getGoalStrategy)(profile.goal);
        const pool = (0, exerciseSelectionService_1.buildSafePool)(exercise.bodyPart, profile, strategy);
        const filtered = pool.filter((catEx) => catEx.id !== exercise.id);
        if (filtered.length === 0)
            return null;
        const picked = (0, exerciseSelectionService_1.pickFromPool)(filtered, 1, rng, new Set());
        const candidate = picked[0];
        const [min, max] = strategy.reps[profile.experience];
        return {
            id: candidate.id,
            name: candidate.name,
            bodyPart: candidate.bodyPart,
            equipment: candidate.equipment,
            sets: strategy.sets[profile.experience],
            reps: min === max ? `${min}` : `${min}-${max}`,
            restSeconds: strategy.restSeconds,
        };
    }
    catch {
        return null;
    }
}
function parseRepRange(reps) {
    if (reps.includes("-")) {
        const [min, max] = reps.split("-").map(Number);
        return [min, max];
    }
    const val = Number(reps) || 8;
    return [val, val];
}
//# sourceMappingURL=progressionService.js.map