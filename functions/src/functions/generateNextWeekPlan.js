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
exports.NextWeekGenerationError = exports.checkWeekEligibility = exports.generateNextWeekPlanService = exports.checkWeeklyPlan = void 0;
exports.checkWeeklyPlanHandler = checkWeeklyPlanHandler;
const functions = __importStar(require("firebase-functions"));
const v2_1 = require("firebase-functions/v2");
const nextWeekGenerationService_1 = require("../services/nextWeekGenerationService");
Object.defineProperty(exports, "generateNextWeekPlanService", { enumerable: true, get: function () { return nextWeekGenerationService_1.generateNextWeekPlanService; } });
Object.defineProperty(exports, "checkWeekEligibility", { enumerable: true, get: function () { return nextWeekGenerationService_1.checkWeekEligibility; } });
Object.defineProperty(exports, "NextWeekGenerationError", { enumerable: true, get: function () { return nextWeekGenerationService_1.NextWeekGenerationError; } });
async function checkWeeklyPlanHandler(request) {
    if (!request.auth?.uid) {
        throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
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
            throw new functions.https.HttpsError(code, err.message);
        }
        v2_1.logger.error("workoutPlan.check_weekly_plan_error", { fn: "checkWeeklyPlan", uid, message: err instanceof Error ? err.message : String(err) });
        throw new functions.https.HttpsError("failed-precondition", "Failed to check weekly plan.");
    }
}
exports.checkWeeklyPlan = functions.https.onCall({
    timeoutSeconds: 60,
    memory: "256MiB",
}, checkWeeklyPlanHandler);
//# sourceMappingURL=generateNextWeekPlan.js.map