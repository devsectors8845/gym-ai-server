"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProfile = getUserProfile;
exports.getCurrentWorkoutPlan = getCurrentWorkoutPlan;
exports.getRecentWorkoutHistory = getRecentWorkoutHistory;
exports.getRecentExerciseHistory = getRecentExerciseHistory;
exports.getExerciseWeightHistory = getExerciseWeightHistory;
const admin_1 = require("./admin");
const collections_1 = require("./collections");
/**
 * Read-only helpers so future AI/workout functions can access a user's data
 * safely — always keyed by the AUTHENTICATED uid the caller passes in, never
 * a client-supplied id (enforcing that is the caller's job; see
 * `functions/chatWithCoach.ts` for the pattern of taking `uid` only from
 * `request.auth`).
 *
 * Deliberately not used by `chatWithCoach` yet — this task establishes the
 * secure boundary and the AI provider abstraction, not workout-context-aware
 * chat (see audit §16/§17 for that follow-up). These exist so that work has
 * a ready, tested place to plug into rather than starting from scratch.
 *
 * No schema changes: field shapes are read as `Record<string, unknown>` /
 * `FirebaseFirestore.DocumentData` rather than app-specific interfaces,
 * since defining the "real" TypeScript shape of the questionnaire/plan
 * objects is itself schema/design work out of scope here.
 */
async function getUserProfile(uid) {
    const snap = await admin_1.db.collection(collections_1.USER_PROFILE_COLLECTION).doc(uid).get();
    return snap.exists ? snap.data() : undefined;
}
async function getCurrentWorkoutPlan(uid) {
    const snap = await admin_1.db.collection(collections_1.WORKOUTS_COLLECTION).doc(uid).get();
    return snap.exists ? snap.data() : undefined;
}
async function getRecentWorkoutHistory(uid, limit = 10) {
    const snap = await admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(collections_1.WORKOUT_HISTORY_SUBCOLLECTION)
        .orderBy("completedAt", "desc")
        .limit(limit)
        .get();
    return snap.docs.map((d) => d.data());
}
async function getRecentExerciseHistory(uid, limit = 20) {
    const snap = await admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(collections_1.EXERCISE_HISTORY_SUBCOLLECTION)
        .orderBy("completedAt", "desc")
        .limit(limit)
        .get();
    return snap.docs.map((d) => d.data());
}
async function getExerciseWeightHistory(uid, exerciseId) {
    const snap = await admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(collections_1.EXERCISE_WEIGHTS_SUBCOLLECTION)
        .doc(exerciseId)
        .get();
    return snap.exists ? snap.data() : undefined;
}
//# sourceMappingURL=userRepository.js.map