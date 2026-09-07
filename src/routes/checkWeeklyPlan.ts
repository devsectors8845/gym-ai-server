import { Router } from "express";
import { checkWeeklyPlanHandler } from "../../../functions/src/functions/generateNextWeekPlan";
import { requireFirebaseAuth } from "../middleware/auth";
import { adaptHandler } from "../middleware/adapter";

/**
 * POST /api/checkWeeklyPlan
 *
 * Two-in-one endpoint that mirrors the original `checkWeeklyPlan` Cloud
 * Function's behavior:
 *   - "eligible"  -> analyzes the past week, builds the next-week plan
 *                    (Week 2+ progression), saves to Firestore, returns
 *                    `{ action: "generated", plan, planId, weekNumber, ... }`
 *   - "up_to_date" / "not_ready" -> returns a status payload; the client
 *                    decides whether to show "come back later" or similar.
 *
 * Auth required. Idempotent: a lock doc prevents concurrent generation.
 */
export const checkWeeklyPlanRouter = Router();

checkWeeklyPlanRouter.post(
  "/",
  requireFirebaseAuth,
  adaptHandler(checkWeeklyPlanHandler)
);
