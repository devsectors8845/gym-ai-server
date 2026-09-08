import { HttpError, type HttpErrorCode } from "./errors";
// Re-export so call sites that already import from this module (e.g. the
// Express error middleware) can grab the class without a second import.
export { HttpError };

/**
 * Error categories the deterministic workout engine can fail with. Mirrors
 * the pattern in `utils/errors.ts` (one typed error class, one place that
 * maps categories to `HttpError`s) but kept separate from the chat feature's
 * `AIProviderError` since these are unrelated failure domains (Step 9: no
 * silent fallback — every one of these is an explicit, observable rejection,
 * never a silent substitution).
 */
export type WorkoutErrorCategory =
  | "missing_profile" // user has never completed the questionnaire
  | "invalid_goal" // goal value not in the supported 8
  | "invalid_experience" // experience value not recognized
  | "invalid_equipment" // no recognizable equipment value at all
  | "invalid_frequency" // workout-day count outside 1-7 / not a number
  | "empty_pool" // safety+equipment filtering left zero eligible exercises for a body part
  | "invalid_plan" // the assembled plan failed post-generation validation
  | "invalid_request"; // malformed client payload (used by validateWorkoutPlan)

export class WorkoutEngineError extends Error {
  readonly category: WorkoutErrorCategory;
  /** Non-sensitive detail for server-side logs only — never sent to the client verbatim beyond the generic message below. */
  readonly detail?: string;

  constructor(category: WorkoutErrorCategory, message: string, detail?: string) {
    super(message);
    this.name = "WorkoutEngineError";
    this.category = category;
    this.detail = detail;
  }
}

/**
 * Maps a `WorkoutEngineError` to a client-safe `HttpError`. Every branch is
 * an explicit, controlled rejection — there is no default/fallback case that
 * silently substitutes a different goal/equipment/exercise (Step 2 / Step 9).
 */
export function toWorkoutHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) {
    return err;
  }

  if (err instanceof WorkoutEngineError) {
    const message: string = err.message;
    let code: HttpErrorCode = "internal";
    let userMessage: string = message || "Invalid request.";

    switch (err.category) {
      case "missing_profile":
        code = "failed-precondition";
        userMessage = "Please complete your onboarding questionnaire before generating a workout plan.";
        break;
      case "invalid_goal":
        code = "failed-precondition";
        userMessage = "Your saved goal isn't recognized. Please reselect your goal and try again.";
        break;
      case "invalid_experience":
        code = "failed-precondition";
        userMessage = "Your saved experience level isn't recognized. Please update it and try again.";
        break;
      case "invalid_equipment":
        code = "failed-precondition";
        userMessage = "No recognizable equipment selection was found. Please update your available equipment and try again.";
        break;
      case "invalid_frequency":
        code = "failed-precondition";
        userMessage = "Your saved weekly workout frequency isn't valid. Please update it and try again.";
        break;
      case "empty_pool":
        code = "failed-precondition";
        userMessage = "We couldn't find any safe exercises for your current equipment and limitations. Please review your equipment and injury notes, or try a manual workout.";
        break;
      case "invalid_plan":
        code = "internal";
        userMessage = "The generated plan failed a safety check and was not saved. Please try again.";
        break;
      case "invalid_request":
      default:
        code = "invalid-argument";
        userMessage = message || "Invalid request.";
    }
    return new HttpError(code, userMessage);
  }

  return new HttpError("internal", "Something went wrong while building your workout plan.");
}

/** Backwards-compatible alias for the Cloud Functions name. */
export const toWorkoutHttpsError = toWorkoutHttpError;
