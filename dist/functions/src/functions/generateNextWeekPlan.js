"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextWeekGenerationError = exports.checkWeekEligibility = exports.generateNextWeekPlanService = void 0;
exports.checkWeeklyPlanHandler = checkWeeklyPlanHandler;
const errors_1 = require("../utils/errors");
const v2_1 = require("firebase-functions/v2");
const nextWeekGenerationService_1 = require("../services/nextWeekGenerationService");
Object.defineProperty(exports, "generateNextWeekPlanService", { enumerable: true, get: function () { return nextWeekGenerationService_1.generateNextWeekPlanService; } });
Object.defineProperty(exports, "checkWeekEligibility", { enumerable: true, get: function () { return nextWeekGenerationService_1.checkWeekEligibility; } });
Object.defineProperty(exports, "NextWeekGenerationError", { enumerable: true, get: function () { return nextWeekGenerationService_1.NextWeekGenerationError; } });
async function checkWeeklyPlanHandler(request) {
    if (!request.auth?.uid) {
        throw new errors_1.HttpError("unauthenticated", "You must be signed in.");
    }
    const uid = request.auth.uid;
    try {
        const eligibility = await (0, nextWeekGenerationService_1.checkWeekEligibility)(uid);
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
        const result = await (0, nextWeekGenerationService_1.generateNextWeekPlanService)(uid);
        return {
            action: "generated",
            plan: result.plan,
            planId: result.planId,
            weekNumber: result.weekNumber,
            message: "Next week plan generated successfully.",
            analysis: result.analysis,
        };
    }
    catch (err) {
        if (err instanceof nextWeekGenerationService_1.NextWeekGenerationError) {
            const codeMap = {
                "unauthenticated": "unauthenticated",
                "failed-precondition": "failed-precondition",
                "resource-exhausted": "resource-exhausted",
                "invalid_plan": "failed-precondition",
                "unexpected": "failed-precondition",
            };
            const code = codeMap[err.category] || "failed-precondition";
            throw new errors_1.HttpError(code, err.message);
        }
        v2_1.logger.error("workoutPlan.check_weekly_plan_error", { fn: "checkWeeklyPlan", uid, message: err instanceof Error ? err.message : String(err) });
        throw new errors_1.HttpError("failed-precondition", "Failed to check weekly plan.");
    }
}
//# sourceMappingURL=generateNextWeekPlan.js.map