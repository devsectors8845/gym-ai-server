import { Router } from "express";
import { validateWorkoutPlanHandler } from "../../../functions/src/functions/validateWorkoutPlan";
import { requireFirebaseAuth } from "../middleware/auth";
import { adaptHandler } from "../middleware/adapter";

/**
 * POST /api/validateWorkoutPlan
 *
 * Validates a manually-built plan against the user's equipment and
 * limitation rules before the client persists it. Best-effort catalog
 * matching by exercise name.
 *
 * Body shape: `{ dailyWorkouts: Record<string, { name: string, bodyPart?: string, equipment?: string }[]> }`
 */
export const validateWorkoutPlanRouter = Router();

validateWorkoutPlanRouter.post(
  "/",
  requireFirebaseAuth,
  adaptHandler(validateWorkoutPlanHandler)
);
