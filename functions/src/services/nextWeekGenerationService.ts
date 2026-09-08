import { logger } from "firebase-functions/v2";
import { db } from "../firestore/admin";
import { USER_HISTORY_ROOT_COLLECTION } from "../firestore/collections";
import { getUserProfile, getCurrentWorkoutPlan } from "../firestore/userRepository";
import {
  archivePlanVersion,
  savePlanVersion,
} from "../firestore/planHistoryRepository";
import { saveGeneratedPlan } from "../firestore/workoutRepository";
import { normalizeProfile } from "../services/profileService";
import { buildPlan } from "../services/planBuilder";
import { validateGeneratedPlan } from "../utils/planValidation";
import { WorkoutEngineError } from "../utils/workoutErrors";
import { GeneratedPlan } from "../types/workout";
import { analyzeWorkoutWeek } from "../services/weekAnalysisService";
import { calculateProgression, applyProgressionAdjustments } from "../services/progressionService";
import { PLAN_SCHEMA_VERSION } from "../services/planBuilder";

const LOCK_COLLECTION = "generationLocks";
const LOCK_DOC = "generateNextWeekPlan";

export interface NextWeekGenerationResult {
  plan: GeneratedPlan;
  planId: string;
  previousPlanId: string;
  weekNumber: number;
  analysis: {
    completionPercentage: number;
    overallRecommendation: string;
  };
  generatedAt: string;
}

export class NextWeekGenerationError extends Error {
  constructor(
    message: string,
    public readonly category: "unauthenticated" | "failed-precondition" | "resource-exhausted" | "invalid_plan" | "unexpected"
  ) {
    super(message);
    this.name = "NextWeekGenerationError";
  }
}

export async function acquireGenerationLock(uid: string): Promise<boolean> {
  const lockRef = db.collection(LOCK_COLLECTION).doc(`${uid}_${LOCK_DOC}`);
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

export async function releaseGenerationLock(uid: string): Promise<void> {
  const lockRef = db.collection(LOCK_COLLECTION).doc(`${uid}_${LOCK_DOC}`);
  await lockRef.delete();
}

export async function isNextWeekAlreadyGenerated(uid: string, currentPlanId: string): Promise<boolean> {
  const snap = await db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection("planHistory")
    .where("previousPlanId", "==", currentPlanId)
    .limit(1)
    .get();

  return !snap.empty;
}

export interface WeekEligibility {
  isEligible: boolean;
  reason: string;
  currentWeekNumber: number;
  currentPlanId: string;
  nextPlanId?: string;
  weekStart: string | null;
  nextPlanDue: string | null;
}

export async function checkWeekEligibility(uid: string): Promise<WeekEligibility> {
  const currentPlanData = await getCurrentWorkoutPlan(uid);
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

  const currentPlan = currentPlanData.plan as GeneratedPlan;
  const currentWeekNumber = (currentPlanData.weekNumber as number) || 1;
  const nextPlanDue = (currentPlanData.nextPlanDue as { toDate: () => Date })?.toDate?.();
  const now = new Date();

  if (nextPlanDue && now < nextPlanDue) {
    return {
      isEligible: false,
      reason: "Current week is not yet complete.",
      currentWeekNumber,
      currentPlanId: currentPlan.planId,
      weekStart: (currentPlanData.weekStart as { toDate: () => Date })?.toDate?.().toISOString() || null,
      nextPlanDue: nextPlanDue.toISOString(),
    };
  }

  const alreadyGenerated = await isNextWeekAlreadyGenerated(uid, currentPlan.planId);
  if (alreadyGenerated) {
    const snap = await db
      .collection(USER_HISTORY_ROOT_COLLECTION)
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
      weekStart: (currentPlanData.weekStart as { toDate: () => Date })?.toDate?.().toISOString() || null,
      nextPlanDue: nextPlanDue?.toISOString() || null,
    };
  }

  return {
    isEligible: true,
    reason: "Ready for next week generation.",
    currentWeekNumber,
    currentPlanId: currentPlan.planId,
    weekStart: (currentPlanData.weekStart as { toDate: () => Date })?.toDate?.().toISOString() || null,
    nextPlanDue: nextPlanDue?.toISOString() || null,
  };
}

export async function generateNextWeekPlanService(uid: string): Promise<NextWeekGenerationResult> {
  const startedAt = Date.now();

  const lockAcquired = await acquireGenerationLock(uid);
  if (!lockAcquired) {
    throw new NextWeekGenerationError("Plan generation already in progress.", "resource-exhausted");
  }

  try {
    const currentPlanData = await getCurrentWorkoutPlan(uid);
    if (!currentPlanData || !currentPlanData.plan) {
      throw new NextWeekGenerationError("No active workout plan found.", "failed-precondition");
    }

    const currentPlan = currentPlanData.plan as GeneratedPlan;
    const currentWeekNumber = (currentPlanData.weekNumber as number) || 1;

    const alreadyGenerated = await isNextWeekAlreadyGenerated(uid, currentPlan.planId);
    if (alreadyGenerated) {
      throw new NextWeekGenerationError("Next week plan already exists.", "failed-precondition");
    }

    const analysis = await analyzeWorkoutWeek(uid, currentPlan.planId, currentWeekNumber);

    const rawProfile = await getUserProfile(uid);
    if (!rawProfile) {
      throw new NextWeekGenerationError("User profile not found.", "failed-precondition");
    }
    const profile = normalizeProfile(rawProfile);

    const progression = calculateProgression(analysis, currentPlan, profile);

    if (progression.requiresManualReview) {
      logger.warn("workoutPlan.manual_review_required", {
        fn: "generateNextWeekPlanService",
        uid,
        planId: currentPlan.planId,
        safetyFlags: progression.safetyFlags,
      });
      throw new NextWeekGenerationError(
        "This plan requires manual review due to multiple safety flags.",
        "failed-precondition"
      );
    }

    const now = new Date();
    const newPlan = buildPlan(uid, profile, now, currentWeekNumber + 1, currentPlan.planId);

    const adjustedPlan = applyProgressionAdjustments(newPlan, progression, profile);

    adjustedPlan.planId = progression.planId;
    adjustedPlan.schemaVersion = PLAN_SCHEMA_VERSION;

    const validation = validateGeneratedPlan(adjustedPlan, profile, uid);
    if (!validation.valid) {
      throw new WorkoutEngineError(
        "invalid_plan",
        "Generated next-week plan failed validation after applying progression.",
        validation.errors.join("; ")
      );
    }

    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    await saveGeneratedPlan(uid, adjustedPlan);

    await savePlanVersion(uid, {
      planId: currentPlan.planId,
      userId: uid,
      version: currentWeekNumber,
      weekNumber: currentWeekNumber,
      status: "completed",
      plan: currentPlanData.plan as Record<string, unknown>,
      weekStart: (currentPlanData.weekStart as string) || weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      generatedAt: currentPlan.generatedAt,
      completedAt: new Date().toISOString(),
      previousPlanId: currentPlanData.previousPlanId || null,
      nextPlanId: progression.planId,
      createdAt: currentPlanData.createdAt || new Date().toISOString(),
    });

    await savePlanVersion(uid, {
      planId: progression.planId,
      userId: uid,
      version: currentWeekNumber + 1,
      weekNumber: currentWeekNumber + 1,
      status: "active",
      plan: adjustedPlan as unknown as Record<string, unknown>,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      generatedAt: adjustedPlan.generatedAt,
      completedAt: null,
      previousPlanId: currentPlan.planId,
      nextPlanId: null,
      createdAt: new Date().toISOString(),
    });

    await archivePlanVersion(uid, currentPlan.planId);

    logger.info("workoutPlan.request_success", {
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
  } catch (err) {
    const category = err instanceof NextWeekGenerationError ? err.category : "unexpected";
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("workoutPlan.request_failure", {
      fn: "generateNextWeekPlanService",
      uid,
      errorCategory: category,
      durationMs: Date.now() - startedAt,
    });
    if (!(err instanceof NextWeekGenerationError) && !(err instanceof WorkoutEngineError)) {
      logger.error("workoutPlan.unexpected_error", { fn: "generateNextWeekPlanService", uid, message });
    }
    throw err;
  } finally {
    await releaseGenerationLock(uid);
  }
}
