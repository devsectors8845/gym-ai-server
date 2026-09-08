"use strict";
/**
 * Shared types for the deterministic workout-generation engine.
 *
 * This is intentionally NOT an AI feature (Step 14 forbids that) — every
 * value here is either a fixed enum the questionnaire already produces, or a
 * value this engine computes with plain rules. See `../constants/goals.ts`,
 * `../constants/equipment.ts`, and `../constants/limitations.ts` for the
 * actual mapping tables.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BODY_PARTS = void 0;
exports.BODY_PARTS = [
    "chest",
    "back",
    "shoulders",
    "legs",
    "arms",
    "core",
    "cardio",
];
//# sourceMappingURL=workout.js.map