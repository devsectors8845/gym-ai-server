"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextWeekGenerationError = void 0;
exports.acquireGenerationLock = acquireGenerationLock;
exports.releaseGenerationLock = releaseGenerationLock;
exports.isNextWeekAlreadyGenerated = isNextWeekAlreadyGenerated;
exports.checkWeekEligibility = checkWeekEligibility;
exports.generateNextWeekPlanService = generateNextWeekPlanService;
const v2_1 = require("firebase-functions/v2");
const admin_1 = require("../firestore/admin");
const collections_1 = require("../firestore/collections");
const userRepository_1 = require("../firestore/userRepository");
const planHistoryRepository_1 = require("../firestore/planHistoryRepository");
const workoutRepository_1 = require("../firestore/workoutRepository");
const profileService_1 = require("../services/profileService");
const planBuilder_1 = require("../services/planBuilder");
const planValidation_1 = require("../utils/planValidation");
const workoutErrors_1 = require("../utils/workoutErrors");
const weekAnalysisService_1 = require("../services/weekAnalysisService");
const progressionService_1 = require("../services/progressionService");
const planBuilder_2 = require("../services/planBuilder");
const LOCK_COLLECTION = "generationLocks";
const LOCK_DOC = "generateNextWeekPlan";
class NextWeekGenerationError extends Error {
    constructor(message, category) {
        super(message);
        this.category = category;
        this.name = "NextWeekGenerationError";
    }
}
exports.NextWeekGenerationError = NextWeekGenerationError;
async function acquireGenerationLock(uid) {
    const lockRef = admin_1.db.collection(LOCK_COLLECTION).doc(`${uid}_${LOCK_DOC}`);
    const lockSnap = await lockRef.get();
    if (lockSnap.exists) {
        const lockData = lockSnap.data();
        const lockTimestamp = lockData?.timestamp || 0;
        if (Date.now() - lockTimestamp < 30000) {
            return false;
        }
    }
    await lockRef.set({ timestamp: Date.now(), uid });
    return true;
}
async function releaseGenerationLock(uid) {
    const lockRef = admin_1.db.collection(LOCK_COLLECTION).doc(`${uid}_${LOCK_DOC}`);
    await lockRef.delete();
}
async function isNextWeekAlreadyGenerated(uid, currentPlanId) {
    const snap = await admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection("planHistory")
        .where("previousPlanId", "==", currentPlanId)
        .limit(1)
        .get();
    return !snap.empty;
}
async function checkWeekEligibility(uid) {
    const currentPlanData = await (0, userRepository_1.getCurrentWorkoutPlan)(uid);
    if (!currentPlanData || !currentPlanData.plan) {
        return {
            isEligible: false,
            reason: "No active workout plan found.",
            currentWeekNumber: 0,
            currentPlanId: "",
            weekStart: null,
            nextPlanDue: null,
        };
    }
    const currentPlan = currentPlanData.plan;
    const currentWeekNumber = currentPlanData.weekNumber || 1;
    const nextPlanDue = currentPlanData.nextPlanDue?.toDate?.();
    const now = new Date();
    if (nextPlanDue && now < nextPlanDue) {
        return {
            isEligible: false,
            reason: "Current week is not yet complete.",
            currentWeekNumber,
            currentPlanId: currentPlan.planId,
            weekStart: currentPlanData.weekStart?.toDate?.().toISOString() || null,
            nextPlanDue: nextPlanDue.toISOString(),
        };
    }
    const alreadyGenerated = await isNextWeekAlreadyGenerated(uid, currentPlan.planId);
    if (alreadyGenerated) {
        const snap = await admin_1.db
            .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
            .doc(uid)
            .collection("planHistory")
            .where("previousPlanId", "==", currentPlan.planId)
            .limit(1)
            .get();
        const nextPlan = snap.docs[0]?.data();
        return {
            isEligible: false,
            reason: "Next week plan already exists.",
            currentWeekNumber,
            currentPlanId: currentPlan.planId,
            nextPlanId: nextPlan?.planId,
            weekStart: currentPlanData.weekStart?.toDate?.().toISOString() || null,
            nextPlanDue: nextPlanDue?.toISOString() || null,
        };
    }
    return {
        isEligible: true,
        reason: "Ready for next week generation.",
        currentWeekNumber,
        currentPlanId: currentPlan.planId,
        weekStart: currentPlanData.weekStart?.toDate?.().toISOString() || null,
        nextPlanDue: nextPlanDue?.toISOString() || null,
    };
}
async function generateNextWeekPlanService(uid) {
    const startedAt = Date.now();
    const lockAcquired = await acquireGenerationLock(uid);
    if (!lockAcquired) {
        throw new NextWeekGenerationError("Plan generation already in progress.", "resource-exhausted");
    }
    try {
        const currentPlanData = await (0, userRepository_1.getCurrentWorkoutPlan)(uid);
        if (!currentPlanData || !currentPlanData.plan) {
            throw new NextWeekGenerationError("No active workout plan found.", "failed-precondition");
        }
        const currentPlan = currentPlanData.plan;
        const currentWeekNumber = currentPlanData.weekNumber || 1;
        const alreadyGenerated = await isNextWeekAlreadyGenerated(uid, currentPlan.planId);
        if (alreadyGenerated) {
            throw new NextWeekGenerationError("Next week plan already exists.", "failed-precondition");
        }
        const analysis = await (0, weekAnalysisService_1.analyzeWorkoutWeek)(uid, currentPlan.planId, currentWeekNumber);
        const rawProfile = await (0, userRepository_1.getUserProfile)(uid);
        if (!rawProfile) {
            throw new NextWeekGenerationError("User profile not found.", "failed-precondition");
        }
        const profile = (0, profileService_1.normalizeProfile)(rawProfile);
        const progression = (0, progressionService_1.calculateProgression)(analysis, currentPlan, profile);
        if (progression.requiresManualReview) {
            v2_1.logger.warn("workoutPlan.manual_review_required", {
                fn: "generateNextWeekPlanService",
                uid,
                planId: currentPlan.planId,
                safetyFlags: progression.safetyFlags,
            });
            throw new NextWeekGenerationError("This plan requires manual review due to multiple safety flags.", "failed-precondition");
        }
        const now = new Date();
        const newPlan = (0, planBuilder_1.buildPlan)(uid, profile, now, currentWeekNumber + 1, currentPlan.planId);
        const adjustedPlan = (0, progressionService_1.applyProgressionAdjustments)(newPlan, progression, profile);
        adjustedPlan.planId = progression.planId;
        adjustedPlan.schemaVersion = planBuilder_2.PLAN_SCHEMA_VERSION;
        const validation = (0, planValidation_1.validateGeneratedPlan)(adjustedPlan, profile, uid);
        if (!validation.valid) {
            throw new workoutErrors_1.WorkoutEngineError("invalid_plan", "Generated next-week plan failed validation after applying progression.", validation.errors.join("; "));
        }
        const weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        await (0, workoutRepository_1.saveGeneratedPlan)(uid, adjustedPlan);
        await (0, planHistoryRepository_1.savePlanVersion)(uid, {
            planId: currentPlan.planId,
            userId: uid,
            version: currentWeekNumber,
            weekNumber: currentWeekNumber,
            status: "completed",
            plan: currentPlanData.plan,
            weekStart: currentPlanData.weekStart || weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            generatedAt: currentPlan.generatedAt,
            completedAt: new Date().toISOString(),
            previousPlanId: currentPlanData.previousPlanId || null,
            nextPlanId: progression.planId,
            createdAt: currentPlanData.createdAt || new Date().toISOString(),
        });
        await (0, planHistoryRepository_1.savePlanVersion)(uid, {
            planId: progression.planId,
            userId: uid,
            version: currentWeekNumber + 1,
            weekNumber: currentWeekNumber + 1,
            status: "active",
            plan: adjustedPlan,
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            generatedAt: adjustedPlan.generatedAt,
            completedAt: null,
            previousPlanId: currentPlan.planId,
            nextPlanId: null,
            createdAt: new Date().toISOString(),
        });
        await (0, planHistoryRepository_1.archivePlanVersion)(uid, currentPlan.planId);
        v2_1.logger.info("workoutPlan.request_success", {
            fn: "generateNextWeekPlanService",
            uid,
            previousPlanId: currentPlan.planId,
            newPlanId: progression.planId,
            weekNumber: currentWeekNumber + 1,
            completionPct: analysis.completionPercentage,
            durationMs: Date.now() - startedAt,
        });
        return {
            plan: adjustedPlan,
            planId: progression.planId,
            previousPlanId: currentPlan.planId,
            weekNumber: currentWeekNumber + 1,
            analysis: {
                completionPercentage: analysis.completionPercentage,
                overallRecommendation: analysis.overallRecommendation,
            },
            generatedAt: adjustedPlan.generatedAt,
        };
    }
    catch (err) {
        const category = err instanceof NextWeekGenerationError ? err.category : "unexpected";
        const message = err instanceof Error ? err.message : String(err);
        v2_1.logger.warn("workoutPlan.request_failure", {
            fn: "generateNextWeekPlanService",
            uid,
            errorCategory: category,
            durationMs: Date.now() - startedAt,
        });
        if (!(err instanceof NextWeekGenerationError) && !(err instanceof workoutErrors_1.WorkoutEngineError)) {
            v2_1.logger.error("workoutPlan.unexpected_error", { fn: "generateNextWeekPlanService", uid, message });
        }
        throw err;
    }
    finally {
        await releaseGenerationLock(uid);
    }
}
//# sourceMappingURL=nextWeekGenerationService.js.map