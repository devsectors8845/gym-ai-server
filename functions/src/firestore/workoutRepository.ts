import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { WORKOUTS_COLLECTION } from "./collections";
import { GeneratedPlan } from "../types/workout";

/**
 * Writes the weekly plan doc at `workouts/{uid}`, preserving the exact
 * top-level field names the React Native app already reads/writes
 * (`weekStart`, `nextPlanDue`, `plan`, `createdAt`, `source`) — see
 * `src/screens/Questionnaire/WorkoutGenerating.js`'s old `.set()` call.
 * This is a full `.set()`, matching prior behavior (one current plan per
 * user, not a history) — Step 11 explicitly forbids changing this into a
 * versioned/history collection in this task.
 */
export async function saveGeneratedPlan(uid: string, plan: GeneratedPlan): Promise<void> {
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  const nextPlanDue = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  await db
    .collection(WORKOUTS_COLLECTION)
    .doc(uid)
    .set({
      weekStart: Timestamp.fromDate(weekStart),
      nextPlanDue: Timestamp.fromDate(nextPlanDue),
      weekNumber: plan.weekNumber || 1,
      previousPlanId: plan.previousPlanId || null,
      plan,
      createdAt: FieldValue.serverTimestamp(),
      source: "Deterministic Workout Engine",
    });
}
