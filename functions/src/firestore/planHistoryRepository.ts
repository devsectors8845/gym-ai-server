import { db } from "./admin";
import {
  USER_HISTORY_ROOT_COLLECTION,
} from "./collections";
import { PlanVersion, WeekAnalysis } from "../types/history";

const PLAN_HISTORY_SUBCOLLECTION = "planHistory";
const WEEK_ANALYSIS_SUBCOLLECTION = "weekAnalysis";

export async function savePlanVersion(uid: string, planVersion: PlanVersion): Promise<void> {
  const ref = db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(PLAN_HISTORY_SUBCOLLECTION)
    .doc(planVersion.planId);

  await ref.set({
    ...planVersion,
    createdAt: planVersion.createdAt || new Date().toISOString(),
  });
}

export async function getPlanVersion(uid: string, planId: string): Promise<PlanVersion | null> {
  const snap = await db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(PLAN_HISTORY_SUBCOLLECTION)
    .doc(planId)
    .get();

  if (!snap.exists) return null;
  return snap.data() as PlanVersion;
}

export async function getCurrentPlanVersion(uid: string): Promise<PlanVersion | null> {
  const snap = await db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(PLAN_HISTORY_SUBCOLLECTION)
    .where("status", "==", "active")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data() as PlanVersion;
}

export async function getPlanVersionsForWeek(uid: string, weekNumber: number): Promise<PlanVersion[]> {
  const snap = await db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(PLAN_HISTORY_SUBCOLLECTION)
    .where("weekNumber", "==", weekNumber)
    .get();

  return snap.docs.map((d) => d.data() as PlanVersion);
}

export async function listPlanVersions(uid: string, limit = 20): Promise<PlanVersion[]> {
  const snap = await db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(PLAN_HISTORY_SUBCOLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((d) => d.data() as PlanVersion);
}

export async function archivePlanVersion(uid: string, planId: string): Promise<void> {
  const ref = db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(PLAN_HISTORY_SUBCOLLECTION)
    .doc(planId);

  await ref.update({
    status: "archived",
  });
}

export async function markPlanCompleted(uid: string, planId: string): Promise<void> {
  const ref = db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(PLAN_HISTORY_SUBCOLLECTION)
    .doc(planId);

  await ref.update({
    status: "completed",
    completedAt: new Date().toISOString(),
  });
}

export async function saveWeekAnalysis(uid: string, analysis: WeekAnalysis): Promise<void> {
  const ref = db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(WEEK_ANALYSIS_SUBCOLLECTION)
    .doc(`${analysis.planId}_week${analysis.weekNumber}`);

  await ref.set({
    ...analysis,
    analyzedAt: analysis.analyzedAt || new Date().toISOString(),
  });
}

export async function getWeekAnalysis(uid: string, planId: string, weekNumber: number): Promise<WeekAnalysis | null> {
  const snap = await db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(WEEK_ANALYSIS_SUBCOLLECTION)
    .doc(`${planId}_week${weekNumber}`)
    .get();

  if (!snap.exists) return null;
  return snap.data() as WeekAnalysis;
}

export async function getLatestWeekAnalysis(uid: string): Promise<WeekAnalysis | null> {
  const snap = await db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(WEEK_ANALYSIS_SUBCOLLECTION)
    .orderBy("analyzedAt", "desc")
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data() as WeekAnalysis;
}
