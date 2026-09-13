import { HttpError } from "../utils/errors";
import { logger } from "firebase-functions/v2";
import { CallableRequest } from "firebase-functions/v2/https";
import { generateNextWeekPlanService, checkWeekEligibility, NextWeekGenerationError } from "../services/nextWeekGenerationService";
import { GeneratedPlan } from "../types/workout";

export interface CheckWeeklyPlanResponse {
  action: "generated" | "up_to_date" | "not_ready";
  plan: GeneratedPlan | null;
  planId: string;
  weekNumber: number;
  message: string;
  analysis?: {
    completionPercentage: number;
    overallRecommendation: string;
  };
}

export async function checkWeeklyPlanHandler(
  request: CallableRequest<unknown>
): Promise<CheckWeeklyPlanResponse> {
  if (!request.auth?.uid) {
    throw new HttpError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;

  try {
    const eligibility = await checkWeekEligibility(uid);

    if (!eligibility.isEligible) {
      if (eligibility.reason.includes("already exists")) {
        return {
          action: "up_to_date",
          plan: null,
          planId: eligibility.currentPlanId,
          weekNumber: eligibility.currentWeekNumber,
          message: eligibility.reason,
        };
      }

      if (eligibility.reason.includes("not yet complete")) {
        return {
          action: "not_ready",
          plan: null,
          planId: eligibility.currentPlanId,
          weekNumber: eligibility.currentWeekNumber,
          message: eligibility.reason,
        };
      }

      if (eligibility.reason.includes("No active workout plan")) {
        return {
          action: "not_ready",
          plan: null,
          planId: "",
          weekNumber: 0,
          message: eligibility.reason,
        };
      }

      return {
        action: "up_to_date",
        plan: null,
        planId: eligibility.currentPlanId,
        weekNumber: eligibility.currentWeekNumber,
        message: eligibility.reason,
      };
    }

    const result = await generateNextWeekPlanService(uid);

    return {
      action: "generated",
      plan: result.plan,
      planId: result.planId,
      weekNumber: result.weekNumber,
      message: "Next week plan generated successfully.",
      analysis: result.analysis,
    };
  } catch (err) {
    if (err instanceof NextWeekGenerationError) {
      const codeMap: Record<string, "unauthenticated" | "failed-precondition" | "resource-exhausted"> = {
        "unauthenticated": "unauthenticated",
        "failed-precondition": "failed-precondition",
        "resource-exhausted": "resource-exhausted",
        "invalid_plan": "failed-precondition",
        "unexpected": "failed-precondition",
      };
      const code = codeMap[err.category] || "failed-precondition";
      throw new HttpError(code, err.message);
    }
    logger.error("workoutPlan.check_weekly_plan_error", { fn: "checkWeeklyPlan", uid, message: err instanceof Error ? err.message : String(err) });
    throw new HttpError("failed-precondition", "Failed to check weekly plan.");
  }
}


export { generateNextWeekPlanService, checkWeekEligibility, NextWeekGenerationError };
