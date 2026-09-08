import { db } from "./admin";
import {
  USER_PROFILE_COLLECTION,
  WORKOUTS_COLLECTION,
  USER_HISTORY_ROOT_COLLECTION,
  WORKOUT_HISTORY_SUBCOLLECTION,
  EXERCISE_HISTORY_SUBCOLLECTION,
  EXERCISE_WEIGHTS_SUBCOLLECTION,
} from "./collections";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";

export interface ExerciseWeightData {
  exerciseId: string;
  exerciseName: string;
  history: Array<{ weight: number; reps: number; date: string; timestamp: number }>;
  currentPR: number;
  repPRs: Record<string, number>;
  lastUpdated: number;
  lastEntry?: { weight: number; reps: number; date: string };
}

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

export async function getUserProfile(
  uid: string
): Promise<FirebaseFirestore.DocumentData | undefined> {
  const snap = await db.collection(USER_PROFILE_COLLECTION).doc(uid).get();
  return snap.exists ? snap.data() : undefined;
}

export async function getCurrentWorkoutPlan(
  uid: string
): Promise<FirebaseFirestore.DocumentData | undefined> {
  const snap = await db.collection(WORKOUTS_COLLECTION).doc(uid).get();
  return snap.exists ? snap.data() : undefined;
}

export async function getRecentWorkoutHistory(
  uid: string,
  limit = 10
): Promise<FirebaseFirestore.DocumentData[]> {
  const snap = await db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(WORKOUT_HISTORY_SUBCOLLECTION)
    .orderBy("completedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => d.data());
}

export async function getRecentExerciseHistory(
  uid: string,
  limit = 20
): Promise<FirebaseFirestore.DocumentData[]> {
  const snap = await db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(EXERCISE_HISTORY_SUBCOLLECTION)
    .orderBy("completedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => d.data());
}

export async function getExerciseWeightHistory(
  uid: string,
  exerciseId: string
): Promise<ExerciseWeightData | undefined> {
  const snap = await db
    .collection(USER_HISTORY_ROOT_COLLECTION)
    .doc(uid)
    .collection(EXERCISE_WEIGHTS_SUBCOLLECTION)
    .doc(exerciseId)
    .get();
  return snap.exists ? (snap.data() as ExerciseWeightData) : undefined;
}
