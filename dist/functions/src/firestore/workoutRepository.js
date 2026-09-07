"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveGeneratedPlan = saveGeneratedPlan;
const firestore_1 = require("firebase-admin/firestore");
const admin_1 = require("./admin");
const collections_1 = require("./collections");
/**
 * Writes the weekly plan doc at `workouts/{uid}`, preserving the exact
 * top-level field names the React Native app already reads/writes
 * (`weekStart`, `nextPlanDue`, `plan`, `createdAt`, `source`) — see
 * `src/screens/Questionnaire/WorkoutGenerating.js`'s old `.set()` call.
 * This is a full `.set()`, matching prior behavior (one current plan per
 * user, not a history) — Step 11 explicitly forbids changing this into a
 * versioned/history collection in this task.
 */
async function saveGeneratedPlan(uid, plan) {
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    const nextPlanDue = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    await admin_1.db
        .collection(collections_1.WORKOUTS_COLLECTION)
        .doc(uid)
        .set({
        weekStart: firestore_1.Timestamp.fromDate(weekStart),
        nextPlanDue: firestore_1.Timestamp.fromDate(nextPlanDue),
        weekNumber: plan.weekNumber || 1,
        previousPlanId: plan.previousPlanId || null,
        plan,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        source: "Deterministic Workout Engine",
    });
}
//# sourceMappingURL=workoutRepository.js.map