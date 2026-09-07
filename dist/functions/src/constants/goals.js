"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOAL_STRATEGIES = exports.QUESTIONNAIRE_EXPERIENCE_MAP = exports.QUESTIONNAIRE_GOAL_MAP = void 0;
exports.resolveGoal = resolveGoal;
exports.resolveExperience = resolveExperience;
exports.getGoalStrategy = getGoalStrategy;
const workoutErrors_1 = require("../utils/workoutErrors");
/**
 * Explicit map from every questionnaire goal string (verbatim, from
 * `src/screens/Questionnaire/GoalsQuestionnaire.js`) to a canonical internal
 * `Goal`. All 8 real options are listed — there is no default/fallback case.
 * An unrecognized string throws `WorkoutEngineError("invalid_goal")` instead
 * of silently becoming `muscle_gain` (Step 2's core requirement).
 *
 * Matching is case-insensitive/trimmed (`resolveGoal` below lowercases and
 * trims before lookup) but otherwise exact — no fuzzy/substring matching,
 * since that's what caused the original "strength" vs "strength training"
 * bug (see GymAI_Workout_Engine_Audit.md's goal-mapping findings).
 */
exports.QUESTIONNAIRE_GOAL_MAP = {
    "strength training": "strength_training",
    powerlifting: "powerlifting",
    health: "health",
    "weight loss": "weight_loss",
    "muscle gain": "muscle_gain",
    "body recomposition": "body_recomposition",
    "general fitness": "general_fitness",
    "athletic performance": "athletic_performance",
};
function resolveGoal(raw) {
    const value = String(raw ?? "").toLowerCase().trim();
    const resolved = exports.QUESTIONNAIRE_GOAL_MAP[value];
    if (!resolved) {
        throw new workoutErrors_1.WorkoutEngineError("invalid_goal", `Unsupported goal: ${JSON.stringify(raw)}`, `raw value did not match any of the ${Object.keys(exports.QUESTIONNAIRE_GOAL_MAP).length} known goal strings`);
    }
    return resolved;
}
exports.QUESTIONNAIRE_EXPERIENCE_MAP = {
    "complete novice": "beginner",
    beginner: "beginner",
    intermediate: "intermediate",
    // The questionnaire's real option is "Advance" (no trailing "d") —
    // mapped explicitly rather than relying on a substring check, which is
    // exactly the bug that caused "Advance" to fall through to "beginner"
    // in the old generator.
    advance: "advanced",
    advanced: "advanced",
};
function resolveExperience(raw) {
    const value = String(raw ?? "").toLowerCase().trim();
    const resolved = exports.QUESTIONNAIRE_EXPERIENCE_MAP[value];
    if (!resolved) {
        throw new workoutErrors_1.WorkoutEngineError("invalid_experience", `Unsupported experience level: ${JSON.stringify(raw)}`);
    }
    return resolved;
}
/**
 * One explicit strategy per goal — every questionnaire goal produces a
 * genuinely different workout (rep range, set volume, rest, movement-type
 * bias, cardio allocation), not a cosmetic relabeling of "Build Muscle"
 * (Step 2's "each goal produces an appropriate workout strategy").
 */
exports.GOAL_STRATEGIES = {
    strength_training: {
        label: "Strength Training",
        reps: { beginner: [5, 8], intermediate: [4, 6], advanced: [3, 5] },
        sets: { beginner: 3, intermediate: 4, advanced: 5 },
        restSeconds: 150,
        preferredMovementTypes: ["compound", "isolation"],
        allowsPlyometric: false,
        cardioDaysForFrequency: () => 0,
        calorieDirection: "maintenance",
        proteinGramsPerKg: 1.8,
        nutritionNotes: [
            "Prioritize protein intake to support recovery between heavy sessions.",
            "Eat enough total calories to fuel strength work — this is not a cutting phase.",
        ],
        guidelines: [
            "Focus on progressive overload: add weight or reps week over week once form is solid.",
            "Rest fully between sets — strength work needs recovery, not a burn.",
            "Prioritize compound lifts before accessory/isolation work.",
        ],
    },
    powerlifting: {
        label: "Powerlifting",
        reps: { beginner: [4, 6], intermediate: [3, 5], advanced: [1, 5] },
        sets: { beginner: 3, intermediate: 4, advanced: 5 },
        restSeconds: 180,
        preferredMovementTypes: ["compound"],
        allowsPlyometric: false,
        cardioDaysForFrequency: () => 0,
        calorieDirection: "maintenance",
        proteinGramsPerKg: 1.9,
        nutritionNotes: [
            "Prioritize protein and total calories to support maximal-strength training and recovery.",
            "Heavier, lower-rep work is more taxing on the nervous system — sleep and recovery matter as much as food.",
        ],
        guidelines: [
            "This plan is compound-lift-focused (squat/press/pull patterns). Warm up thoroughly before working sets.",
            "Rest 2-3 minutes between heavy sets.",
            "If a lift feels off, reduce the load rather than pushing through with poor form.",
        ],
    },
    health: {
        label: "Health",
        reps: { beginner: [10, 15], intermediate: [10, 15], advanced: [10, 15] },
        sets: { beginner: 2, intermediate: 3, advanced: 3 },
        restSeconds: 60,
        preferredMovementTypes: ["compound", "cardio", "mobility"],
        allowsPlyometric: false,
        cardioDaysForFrequency: (days) => Math.max(1, Math.round(days * 0.4)),
        calorieDirection: "maintenance",
        proteinGramsPerKg: 1.4,
        nutritionNotes: [
            "Focus on balanced, whole-food meals rather than a specific calorie target.",
            "Stay consistently hydrated and prioritize sleep — this plan is about sustainable habits, not maximal output.",
        ],
        guidelines: [
            "Moderate intensity, full-body focus — the goal is consistency, not maxing out.",
            "Include mobility/light-cardio days to support general wellbeing.",
        ],
    },
    weight_loss: {
        label: "Weight Loss",
        reps: { beginner: [12, 15], intermediate: [12, 20], advanced: [15, 20] },
        sets: { beginner: 3, intermediate: 3, advanced: 4 },
        restSeconds: 45,
        preferredMovementTypes: ["compound", "cardio"],
        allowsPlyometric: false,
        cardioDaysForFrequency: (days) => Math.max(1, Math.round(days * 0.5)),
        calorieDirection: "deficit",
        proteinGramsPerKg: 1.8,
        nutritionNotes: [
            "A moderate calorie deficit combined with resistance training helps preserve muscle while losing fat.",
            "Keep protein high to support satiety and preserve lean mass in a deficit.",
        ],
        guidelines: [
            "Shorter rest periods keep intensity/heart rate up — this plan is circuit-leaning.",
            "Consistency matters more than intensity here; aim to complete every planned session.",
        ],
    },
    muscle_gain: {
        label: "Muscle Gain",
        reps: { beginner: [10, 12], intermediate: [8, 12], advanced: [6, 12] },
        sets: { beginner: 3, intermediate: 4, advanced: 4 },
        restSeconds: 90,
        preferredMovementTypes: ["compound", "isolation"],
        allowsPlyometric: false,
        cardioDaysForFrequency: () => 0,
        calorieDirection: "surplus",
        proteinGramsPerKg: 2.0,
        nutritionNotes: [
            "A modest calorie surplus with high protein intake supports muscle growth.",
            "Spread protein intake across meals rather than one large serving.",
        ],
        guidelines: [
            "Hypertrophy rep ranges (roughly 8-12) with moderate rest — focus on controlled reps and a full range of motion.",
            "Progressive overload still matters: increase volume or load over time.",
        ],
    },
    body_recomposition: {
        label: "Body Recomposition",
        reps: { beginner: [8, 12], intermediate: [8, 15], advanced: [6, 15] },
        sets: { beginner: 3, intermediate: 4, advanced: 4 },
        restSeconds: 75,
        preferredMovementTypes: ["compound", "isolation", "cardio"],
        allowsPlyometric: false,
        cardioDaysForFrequency: (days) => Math.max(1, Math.round(days * 0.3)),
        calorieDirection: "maintenance",
        proteinGramsPerKg: 2.0,
        nutritionNotes: [
            "Recomposition (building muscle while losing fat) works best around maintenance calories with a high protein intake.",
            "Progress is slower than a pure bulk or cut — track strength and body measurements, not just the scale.",
        ],
        guidelines: [
            "This plan blends hypertrophy strength work with light conditioning finishers.",
            "Be patient — simultaneous muscle gain and fat loss is a slow process by nature.",
        ],
    },
    general_fitness: {
        label: "General Fitness",
        reps: { beginner: [10, 15], intermediate: [10, 15], advanced: [8, 15] },
        sets: { beginner: 3, intermediate: 3, advanced: 4 },
        restSeconds: 75,
        preferredMovementTypes: ["compound", "isolation", "cardio", "mobility"],
        allowsPlyometric: false,
        cardioDaysForFrequency: (days) => Math.max(1, Math.round(days * 0.35)),
        calorieDirection: "maintenance",
        proteinGramsPerKg: 1.6,
        nutritionNotes: [
            "Balanced meals covering all major food groups support general fitness goals.",
            "No aggressive surplus or deficit needed unless a body-composition goal is added.",
        ],
        guidelines: [
            "A well-rounded mix of strength, cardio, and mobility work across the week.",
            "Vary intensity day to day to avoid burnout while staying consistent.",
        ],
    },
    athletic_performance: {
        label: "Athletic Performance",
        reps: { beginner: [6, 10], intermediate: [5, 8], advanced: [3, 8] },
        sets: { beginner: 3, intermediate: 4, advanced: 4 },
        restSeconds: 120,
        preferredMovementTypes: ["compound", "plyometric", "cardio"],
        // Plyometric/explosive work is only introduced for intermediate/advanced
        // lifters — see exerciseSelectionService, which enforces this
        // per-exercise regardless of what this flag says. This flag only
        // controls whether the *pool* is allowed to include plyometric movement
        // types at all before the experience gate runs.
        allowsPlyometric: true,
        cardioDaysForFrequency: (days) => Math.max(1, Math.round(days * 0.3)),
        calorieDirection: "maintenance",
        proteinGramsPerKg: 1.8,
        nutritionNotes: [
            "Fuel around training sessions to support power output and recovery.",
            "Maintenance calories with high protein support performance without unwanted weight change.",
        ],
        guidelines: [
            "Lower reps with a power/explosive emphasis where your experience level allows it.",
            "Beginners: this plan substitutes controlled compound movements for explosive/plyometric work until you build a base — that's intentional, not a downgrade.",
        ],
    },
};
function getGoalStrategy(goal) {
    return exports.GOAL_STRATEGIES[goal];
}
//# sourceMappingURL=goals.js.map