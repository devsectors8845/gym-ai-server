/**
 * Firestore collection names, exactly as the existing React Native app uses
 * them today. This task does not change the schema (Step 11) — these
 * constants exist so future backend functions reference the same collection
 * names consistently instead of re-typing string literals.
 *
 * KNOWN PRE-EXISTING QUIRK, left as-is on purpose: the app uses two
 * differently-cased top-level collections that are easy to mix up —
 *   - "Users"  (capital U) — one profile doc per user, keyed by uid
 *     (`Users/{uid}`, written by SignUp, read by the questionnaire/Decider
 *     flow).
 *   - "users"  (lowercase) — a *different* top-level collection, used only
 *     as the parent for per-user history subcollections
 *     (`users/{uid}/workoutHistory`, `.../exerciseHistory`,
 *     `.../exerciseWeights`), written by `firebaseWorkoutHistory.js`.
 * Firestore collection names are case-sensitive, so these are genuinely two
 * separate collections, not a typo that happens to work. Do not "fix" this
 * casing here without also updating the mobile app — that's a schema
 * migration, explicitly out of scope for this task.
 */
export const USER_PROFILE_COLLECTION = "Users"; // capital U — profile/questionnaire data
export const WORKOUTS_COLLECTION = "workouts"; // current weekly plan, keyed by uid
export const USER_HISTORY_ROOT_COLLECTION = "users"; // lowercase — parent of history subcollections
export const WORKOUT_HISTORY_SUBCOLLECTION = "workoutHistory";
export const EXERCISE_HISTORY_SUBCOLLECTION = "exerciseHistory";
export const EXERCISE_WEIGHTS_SUBCOLLECTION = "exerciseWeights";
