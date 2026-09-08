// V1 `functions.https.onCall` is used (not V2 `onCall`) so this function
// deploys and runs on the Firebase Spark (free) plan. V2 callables require
// Blaze. See `functions/generateWorkoutPlan.ts` for the same V1 pattern.
import * as functions from "firebase-functions";
import { logger } from "firebase-functions/v2";
import { type CallableRequest } from "firebase-functions/v2/https";
import { getUserProfile } from "../firestore/userRepository";
import { resolveEquipment } from "../constants/equipment";
import { parseLimitations } from "../constants/limitations";
import { EXERCISE_CATALOG } from "../data/exerciseCatalog";
import { passesEquipment, passesLimitations } from "../services/exerciseSelectionService";
import { NormalizedProfile } from "../types/workout";

const FUNCTION_NAME = "validateWorkoutPlan";

/**
 * Manual workout entries (`src/screens/Questionnaire/ManualWorkout.js`) are
 * hand-typed by the user — free-text exercise names, not catalog ids — so
 * they can't go through the same deterministic `generateWorkoutPlan`
 * pipeline. This callable is the "manually selected exercises also pass
 * validation where applicable" requirement (Step 4): it applies the same
 * equipment-availability and injury-contraindication rules to any manually
 * entered exercise whose name matches a catalog entry, on a best-effort
 * basis (matching by exact, case-insensitive name — there is no reliable
 * way to know a hand-typed "squats" means the same thing as the catalog's
 * "Barbell Back Squat" beyond that).
 *
 * This does NOT save anything — the mobile app still writes the manual plan
 * to `workouts/{uid}` itself (Step 11: no Firestore-write behavior change
 * for the manual flow). It only tells the client whether to block the save
 * and why, so the UI can show the user what's wrong before they save an
 * unsafe or malformed plan.
 */

interface DraftExercise {
  name?: unknown;
  bodyPart?: unknown;
  equipment?: unknown;
}

interface ValidateWorkoutPlanRequest {
  dailyWorkouts?: Record<string, DraftExercise[]>;
}

export interface ValidateWorkoutPlanResponse {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function findCatalogMatchByName(name: string) {
  const normalized = name.trim().toLowerCase();
  return EXERCISE_CATALOG.find((ex) => ex.name.trim().toLowerCase() === normalized);
}

export async function validateWorkoutPlanHandler(
  request: CallableRequest<ValidateWorkoutPlanRequest>
): Promise<ValidateWorkoutPlanResponse> {
  if (!request.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in to validate a workout plan.");
  }
  const uid = request.auth.uid;

  const data = request.data;
  if (!data || typeof data !== "object" || !data.dailyWorkouts || typeof data.dailyWorkouts !== "object") {
    throw new functions.https.HttpsError("invalid-argument", "A dailyWorkouts object is required.");
  }
  const dailyWorkouts = data.dailyWorkouts as Record<string, DraftExercise[]>;

  const errors: string[] = [];
  const warnings: string[] = [];

  // Best-effort profile lookup for equipment/limitations. A manual builder
  // can be reached before a full profile exists (e.g. AI generation failed
  // very early) — treat that as "nothing to check against" (warn, don't
  // block), never as "unlimited equipment, no limitations."
  let equipment: NormalizedProfile["equipment"] = [];
  let limitations: NormalizedProfile["limitations"] = [];
  try {
    const rawProfile = await getUserProfile(uid);
    if (rawProfile) {
      equipment = resolveEquipment(rawProfile.availableEquipment);
      limitations = parseLimitations(rawProfile.modifications);
    } else {
      warnings.push("No profile found — equipment and injury checks were skipped.");
    }
  } catch (err) {
    logger.warn("validateWorkoutPlan.profile_lookup_failed", {
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
        warnings.push(
          `"${name}" (${dayKey}) is a custom exercise and wasn't automatically checked against your equipment or injury notes.`
        );
        continue;
      }
      const fakeProfile = { equipment, limitations } as NormalizedProfile;
      if (equipment.length > 0 && !passesEquipment(match, fakeProfile)) {
        errors.push(`"${match.name}" (${dayKey}) requires equipment you haven't marked as available.`);
      }
      if (limitations.length > 0 && !passesLimitations(match, fakeProfile)) {
        errors.push(
          `"${match.name}" (${dayKey}) is contraindicated for a limitation you reported (${match.contraindications.join(
            ", "
          )}). Consider one of: ${match.alternatives.join(", ") || "a different exercise"}.`
        );
      }
    }
  }

  if (totalExercises === 0) {
    errors.push("The plan has no exercises.");
  }

  const valid = errors.length === 0;
  logger.info("validateWorkoutPlan.checked", { fn: FUNCTION_NAME, uid, valid, errorCount: errors.length });
  return { valid, errors, warnings };
}

export const validateWorkoutPlan = functions.https.onCall(
  { timeoutSeconds: 15 },
  validateWorkoutPlanHandler
);
