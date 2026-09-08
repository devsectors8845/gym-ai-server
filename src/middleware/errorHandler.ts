import type { Request, Response, NextFunction } from "express";
import { HttpError, toWorkoutHttpError } from "../../functions/src/utils/workoutErrors";
import { logger } from "firebase-functions/v2";

/**
 * Express error handler. Catches any error thrown from a route handler or
 * downstream middleware, maps it to a clean `HttpError` (same shape as the
 * Cloud Functions version), and emits a JSON body with a stable shape:
 *
 *   { error: { code, message } }
 *
 * Never forwards stack traces, provider response bodies, or secrets. The
 * error code mirrors Firebase Functions' `HttpsError` codes so the
 * existing client mapping (e.g. `"functions/failed-precondition"`) keeps
 * working unchanged.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // toWorkoutHttpError returns either a HttpError (when the input was
  // already a WorkoutEngineError or HttpError) or a generic fallback.
  const mapped = toWorkoutHttpError(err);
  // mapped is always an HttpError — but the type union lets it also be
  // `unknown` in some branches, so we narrow defensively.
  const httpErr: HttpError =
    mapped instanceof HttpError ? mapped : new HttpError("internal", "Unexpected error.");

  // Server-side log only — never sent to the client. We log the original
  // error to aid debugging while the response stays generic.
  if (err && !httpErr.message.startsWith("Please complete")) {
    logger.error("server.unexpected_error", {
      path: req.path,
      method: req.method,
      code: httpErr.code,
      message: httpErr.message,
      original: err instanceof Error ? err.name : typeof err,
    });
  }

  res.status(httpErr.httpStatus).json({
    error: {
      code: httpErr.code,
      message: httpErr.message,
    },
  });
}
