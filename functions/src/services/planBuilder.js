"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_SCHEMA_VERSION = void 0;
exports.buildPlan = buildPlan;
const crypto_1 = require("crypto");
const goals_1 = require("../constants/goals");
const templateService_1 = require("./templateService");
const exerciseSelectionService_1 = require("./exerciseSelectionService");
const seededRandom_1 = require("../utils/seededRandom");
exports.PLAN_SCHEMA_VERSION = 1;
/** How many exercises to include per body part, per day slot. Applied per body part that appears in a given day's archetype (a "Push" day touching chest+shoulders+arms gets each of those counts). */
const EXERCISES_PER_BODY_PART = {
    chest: 3,
    back: 3,
    shoulders: 2,
    legs: 4,
    arms: 3,
    core: 2,
    cardio: 1,
};
/**
 * Deterministic-but-varied weekly seed: the same profile generating a plan
 * within the same ~7-day window produces the same exercise picks (testable,
 * predictable — Step 10), while a later week (different `now`) or a changed
 * profile (different goal/equipment/experience/limitations/frequency)
 * produces a different, still-safe selection.
 */
function buildSeedKey(uid, profile, now) {
    const weekIndex = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
    return [
        uid,
        profile.goal,
        profile.experience,
        [...profile.equipment].sort().join(","),
        profile.frequencyDays,
        [...profile.limitations].sort().join(","),
        weekIndex,
    ].join("|");
}
function buildWarmup() {
    return [
        "5 minutes of light cardio (brisk walk, bike, or rower) to raise your heart rate.",
        "Dynamic stretches for the muscle groups you're about to train (arm circles, leg swings, bodyweight squats).",
        "1-2 light warm-up sets of your first exercise before working weight.",
    ];
}
function buildCooldown() {
    return [
        "2-3 minutes of light walking to bring your heart rate down gradually.",
        "Static stretches held for 20-30 seconds for the muscles you trained.",
        "Deep breathing to help transition out of training mode.",
    ];
}
function buildRecovery(profile) {
    const restDaysPerWeek = 7 - profile.frequencyDays;
    const notes = [
        `Aim for 7-9 hours of sleep — recovery, not just training, drives your results.`,
        `Your plan has ${restDaysPerWeek} full rest day(s) this week — use them for light activity or full rest, not more training.`,
    ];
    if (profile.limitations.length > 0) {
        notes.push("You reported a physical limitation — stop any exercise that causes sharp or worsening pain and consult a medical professional if it persists.");
    }
    return notes;
}
function buildGuidelines(profile) {
    const strategy = (0, goals_1.getGoalStrategy)(profile.goal);
    const guidelines = [...strategy.guidelines];
    if (profile.limitations.length > 0) {
        guidelines.push(`Exercises that could aggravate your reported limitation(s) (${profile.limitations.join(", ")}) have been excluded from this plan, with safer alternatives substituted where possible.`);
    }
    return guidelines;
}
function buildNutrition(profile) {
    const strategy = (0, goals_1.getGoalStrategy)(profile.goal);
    const proteinGrams = Math.round(strategy.proteinGramsPerKg * profile.weightKg);
    return {
        calorieDirection: strategy.calorieDirection,
        proteinGramsPerKg: strategy.proteinGramsPerKg,
        notes: [`Target roughly ${proteinGrams}g of protein per day.`, ...strategy.nutritionNotes],
    };
}
/**
 * Builds a full, validated-shape plan for a normalized profile. Throws
 * `WorkoutEngineError("empty_pool")` if any day's body part has no safe
 * exercises available (see `exerciseSelectionService.ts`) — callers should
 * let this propagate as a controlled rejection (Step 9), not catch and
 * substitute something else.
 */
function buildPlan(uid, profile, now = new Date(), weekNumber = 1, previousPlanId = null) {
    const strategy = (0, goals_1.getGoalStrategy)(profile.goal);
    const split = (0, templateService_1.buildWeeklySplit)(profile.goal, profile.frequencyDays);
    const seed = (0, seededRandom_1.hashStringToSeed)(buildSeedKey(uid, profile, now));
    const rng = (0, seededRandom_1.mulberry32)(seed);
    const usedIds = new Set();
    const dailyWorkouts = {};
    const weeklySplitLabels = [];
    split.forEach((day, index) => {
        const dayKey = `Day ${index + 1}`;
        weeklySplitLabels.push(`${dayKey}: ${day.dayLabel}`);
        if (day.bodyParts.length === 0) {
            // Rest day — deliberately empty, this is the one case an empty array
            // is correct rather than a validation failure (see planValidation.ts,
            // which knows to treat a day labeled "Rest" as an intentional rest
            // day rather than a generation bug).
            dailyWorkouts[dayKey] = [];
            return;
        }
        const exercises = [];
        day.bodyParts.forEach((bodyPart) => {
            const count = EXERCISES_PER_BODY_PART[bodyPart];
            exercises.push(...(0, exerciseSelectionService_1.selectExercisesForBodyPart)(bodyPart, count, profile, strategy, rng, usedIds));
        });
        dailyWorkouts[dayKey] = exercises;
    });
    const plan = {
        planId: (0, crypto_1.randomUUID)(),
        schemaVersion: exports.PLAN_SCHEMA_VERSION,
        userProfile: {
            name: profile.fullName,
            age: profile.age,
            gender: profile.gender,
            height: `${Math.round(profile.heightCm)}cm`,
            weight: `${Math.round(profile.weightKg)}kg`,
            goal: profile.goal,
            experience: profile.experience,
            equipment: profile.equipment,
            weekly_workouts: profile.frequencyDays,
            limitations: profile.limitations,
        },
        goal: profile.goal,
        weekly_split: weeklySplitLabels,
        daily_workouts: dailyWorkouts,
        warmup: buildWarmup(),
        cooldown: buildCooldown(),
        workout_guidelines: buildGuidelines(profile),
        recovery: buildRecovery(profile),
        nutrition: buildNutrition(profile),
        generatedAt: now.toISOString(),
        source: "Deterministic Workout Engine",
        weekNumber,
        previousPlanId,
    };
    return plan;
}
//# sourceMappingURL=planBuilder.js.map