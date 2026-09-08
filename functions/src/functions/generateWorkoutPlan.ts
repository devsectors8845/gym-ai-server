// V1 `functions.https.onCall` is used (not V2 `onCall`) so this function
// deploys and runs on the Firebase Spark (free) plan. V2 callables require
// Blaze. The behavior is identical: same auth context, same request shape,
// same HttpsError semantics. See `functions/generateNextWeekPlan.ts` for
// the same V1 pattern in `checkWeeklyPlan`.
import * as functions from "firebase-functions";
import { logger } from "firebase-functions/v2";
import { type CallableRequest } from "firebase-functions/v2/https";
import { getUserProfile } from "../firestore/userRepository";
import { saveGeneratedPlan } from "../firestore/workoutRepository";
import { normalizeProfile } from "../services/profileService";
import { buildPlan } from "../services/planBuilder";
import { validateGeneratedPlan } from "../utils/planValidation";
import { toWorkoutHttpError, WorkoutEngineError } from "../utils/workoutErrors";
import { GeneratedPlan } from "../types/workout";

const FUNCTION_NAME = "generateWorkoutPlan";

export interface GenerateWorkoutPlanResponse {
  plan: GeneratedPlan;
  planId: string;
  generatedAt: string;
}

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
export async function generateWorkoutPlanHandler(
  request: CallableRequest<unknown>
): Promise<GenerateWorkoutPlanResponse> {
  const startedAt = Date.now();
  if (!request.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in to generate a workout plan.");
  }
  const uid = request.auth.uid;
  logger.info("workoutPlan.request_start", { fn: FUNCTION_NAME, uid });

  try {
    const rawProfile = await getUserProfile(uid);
    const profile = normalizeProfile(rawProfile);
    const plan = buildPlan(uid, profile, undefined, 1, null);

    const validation = validateGeneratedPlan(plan, profile, uid);
    if (!validation.valid) {
      throw new WorkoutEngineError(
        "invalid_plan",
        "Generated plan failed validation.",
        validation.errors.join("; ")
      );
    }

    await saveGeneratedPlan(uid, plan);

    logger.info("workoutPlan.request_success", {
      fn: FUNCTION_NAME,
      uid,
      goal: profile.goal,
      frequencyDays: profile.frequencyDays,
      durationMs: Date.now() - startedAt,
    });

    return { plan, planId: plan.planId, generatedAt: plan.generatedAt };
  } catch (err) {
    const category = err instanceof WorkoutEngineError ? err.category : "unexpected";
    logger.warn("workoutPlan.request_failure", {
      fn: FUNCTION_NAME,
      uid,
      errorCategory: category,
      durationMs: Date.now() - startedAt,
    });
    if (!(err instanceof WorkoutEngineError) && !(err instanceof functions.https.HttpsError)) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("workoutPlan.unexpected_error", { fn: FUNCTION_NAME, uid, message });
    }
    throw toWorkoutHttpError(err);
  }
}

export const generateWorkoutPlan = functions.https.onCall(
  { timeoutSeconds: 30 },
  generateWorkoutPlanHandler
);
