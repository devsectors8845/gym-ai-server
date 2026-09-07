"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWorkoutPlan = void 0;
exports.generateWorkoutPlanHandler = generateWorkoutPlanHandler;
// V1 `functions.https.onCall` is used (not V2 `onCall`) so this function
// deploys and runs on the Firebase Spark (free) plan. V2 callables require
// Blaze. The behavior is identical: same auth context, same request shape,
// same HttpsError semantics. See `functions/generateNextWeekPlan.ts` for
// the same V1 pattern in `checkWeeklyPlan`.
const functions = __importStar(require("firebase-functions"));
const v2_1 = require("firebase-functions/v2");
const userRepository_1 = require("../firestore/userRepository");
const workoutRepository_1 = require("../firestore/workoutRepository");
const profileService_1 = require("../services/profileService");
const planBuilder_1 = require("../services/planBuilder");
const planValidation_1 = require("../utils/planValidation");
const workoutErrors_1 = require("../utils/workoutErrors");
const FUNCTION_NAME = "generateWorkoutPlan";
/**
 * The deterministic workout-generation callable (Steps 1-11 of the
 * workout-engine task). Takes no meaningful client input — the profile it
 * generates from is read server-side from `Users/{uid}` using the
 * AUTHENTICATED uid, exactly like `chatWithCoach.ts` never trusts a
 * client-supplied id for anything safety- or identity-relevant. This also
 * means the React Native app no longer needs to serialize/send the whole
 * questionnaire profile over the wire on every generation — it already
 * wrote each field to Firestore as the user filled out the questionnaire
 * (see `src/screens/Questionnaire/*.js`), so the source of truth already
 * lives server-side.
 *
 * Flow: auth -> read profile -> normalize (throws on unsupported/missing
 * goal, experience, equipment, or frequency — Step 2/Step 9, no silent
 * fallback) -> build plan (safety filtering happens before any random
 * selection — Step 7) -> validate (Step 8) -> save to `workouts/{uid}`
 * (Step 11: same collection/shape as before, no schema change) -> return
 * the plan to the client so it can proceed without a second Firestore read.
 */
async function generateWorkoutPlanHandler(request) {
    const startedAt = Date.now();
    if (!request.auth?.uid) {
        throw new functions.https.HttpsError("unauthenticated", "You must be signed in to generate a workout plan.");
    }
    const uid = request.auth.uid;
    v2_1.logger.info("workoutPlan.request_start", { fn: FUNCTION_NAME, uid });
    try {
        const rawProfile = await (0, userRepository_1.getUserProfile)(uid);
        const profile = (0, profileService_1.normalizeProfile)(rawProfile);
        const plan = (0, planBuilder_1.buildPlan)(uid, profile, undefined, 1, null);
        const validation = (0, planValidation_1.validateGeneratedPlan)(plan, profile, uid);
        if (!validation.valid) {
            throw new workoutErrors_1.WorkoutEngineError("invalid_plan", "Generated plan failed validation.", validation.errors.join("; "));
        }
        await (0, workoutRepository_1.saveGeneratedPlan)(uid, plan);
        v2_1.logger.info("workoutPlan.request_success", {
            fn: FUNCTION_NAME,
            uid,
            goal: profile.goal,
            frequencyDays: profile.frequencyDays,
            durationMs: Date.now() - startedAt,
        });
        return { plan, planId: plan.planId, generatedAt: plan.generatedAt };
    }
    catch (err) {
        const category = err instanceof workoutErrors_1.WorkoutEngineError ? err.category : "unexpected";
        v2_1.logger.warn("workoutPlan.request_failure", {
            fn: FUNCTION_NAME,
            uid,
            errorCategory: category,
            durationMs: Date.now() - startedAt,
        });
        if (!(err instanceof workoutErrors_1.WorkoutEngineError) && !(err instanceof functions.https.HttpsError)) {
            const message = err instanceof Error ? err.message : String(err);
            v2_1.logger.error("workoutPlan.unexpected_error", { fn: FUNCTION_NAME, uid, message });
        }
        throw (0, workoutErrors_1.toWorkoutHttpError)(err);
    }
}
exports.generateWorkoutPlan = functions.https.onCall({ timeoutSeconds: 30 }, generateWorkoutPlanHandler);
//# sourceMappingURL=generateWorkoutPlan.js.map