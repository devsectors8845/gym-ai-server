import { Router } from "express";
import { generateWorkoutPlanHandler } from "../../functions/src/functions/generateWorkoutPlan";
import { requireFirebaseAuth } from "../middleware/auth";
import { adaptHandler } from "../middleware/adapter";

/**
 * POST /api/generateWorkoutPlan
 *
 * Generates the user's first weekly workout plan from their questionnaire
 * profile (read server-side from Firestore). No client input — the same
 * contract as the original Cloud Function. Auth required.
 */
export const generateWorkoutPlanRouter = Router();

generateWorkoutPlanRouter.post(
  "/",
  requireFirebaseAuth,
  adaptHandler(generateWorkoutPlanHandler)
);
