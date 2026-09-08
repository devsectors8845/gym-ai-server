"use strict";
/**
 * Firebase Cloud Functions — GymAI
 *
 * The Spark-plan compatible deterministic workout-generation engine that
 * replaced the client-side logic in `src/services/generateWorkoutPlan.js`
 * (see ../CLOUD_FUNCTIONS_BACKEND.md and ../WORKOUT_ENGINE_REFACTOR.md).
 *
 * `chatWithCoach` (AI chat) is intentionally NOT exported on this release —
 * it requires outbound network calls to third-party AI providers (Groq /
 * OpenAI), which Firebase Spark plan does not allow. The handler, provider
 * services, and types are kept under `src/functions/chatWithCoach.ts`,
 * `src/services/aiService.ts`, etc. for a future Blaze / standalone-server
 * release. See `src/functions/chatWithCoach.ts` for the full retention note.
 *
 * Functions deployed on Spark plan (this file's exports):
 *   - `generateWorkoutPlan` — Week 1 plan generation (Firestore-only)
 *   - `validateWorkoutPlan` — manual workout safety validation
 *   - `checkWeeklyPlan`     — Week 2+ eligibility + generation
 *
 * All three callables use Firebase V1 `https.onCall` so they run on the free
 * Spark tier (V2 `onCall` requires Blaze). Auth + Firestore-only access —
 * no outbound third-party HTTP.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkWeeklyPlan = exports.validateWorkoutPlan = exports.generateWorkoutPlan = void 0;
var generateWorkoutPlan_1 = require("./functions/generateWorkoutPlan");
Object.defineProperty(exports, "generateWorkoutPlan", { enumerable: true, get: function () { return generateWorkoutPlan_1.generateWorkoutPlan; } });
var validateWorkoutPlan_1 = require("./functions/validateWorkoutPlan");
Object.defineProperty(exports, "validateWorkoutPlan", { enumerable: true, get: function () { return validateWorkoutPlan_1.validateWorkoutPlan; } });
var generateNextWeekPlan_1 = require("./functions/generateNextWeekPlan");
Object.defineProperty(exports, "checkWeeklyPlan", { enumerable: true, get: function () { return generateNextWeekPlan_1.checkWeeklyPlan; } });
// Future-release (Blaze / standalone server required):
//   export { chatWithCoach } from "./functions/chatWithCoach";
//# sourceMappingURL=index.js.map