"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toWorkoutHttpsError = exports.WorkoutEngineError = exports.HttpError = void 0;
exports.toWorkoutHttpError = toWorkoutHttpError;
const errors_1 = require("./errors");
Object.defineProperty(exports, "HttpError", { enumerable: true, get: function () { return errors_1.HttpError; } });
class WorkoutEngineError extends Error {
    constructor(category, message, detail) {
        super(message);
        this.name = "WorkoutEngineError";
        this.category = category;
        this.detail = detail;
    }
}
exports.WorkoutEngineError = WorkoutEngineError;
/**
 * Maps a `WorkoutEngineError` to a client-safe `HttpError`. Every branch is
 * an explicit, controlled rejection — there is no default/fallback case that
 * silently substitutes a different goal/equipment/exercise (Step 2 / Step 9).
 */
function toWorkoutHttpError(err) {
    if (err instanceof errors_1.HttpError) {
        return err;
    }
    if (err instanceof WorkoutEngineError) {
        const message = err.message;
        let code = "internal";
        let userMessage = message || "Invalid request.";
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
        return new errors_1.HttpError(code, userMessage);
    }
    return new errors_1.HttpError("internal", "Something went wrong while building your workout plan.");
}
/** Backwards-compatible alias for the Cloud Functions name. */
exports.toWorkoutHttpsError = toWorkoutHttpError;
//# sourceMappingURL=workoutErrors.js.map