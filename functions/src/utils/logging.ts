import { logger } from "firebase-functions/v2";

/**
 * Thin structured-logging helpers so every AI-related function logs the same
 * shape of useful, non-sensitive metadata (Step 10), and so there is exactly
 * one place that decides what is safe to log.
 *
 * Deliberately NEVER accept/pass through: API keys, Authorization headers,
 * full request/response bodies, full user profile objects, or full chat
 * message content. Callers should pass metadata (uid, provider, duration,
 * category), not raw payloads.
 */

interface BaseLogFields {
  fn: string; // function name, e.g. "chatWithCoach"
  uid?: string; // authenticated Firebase UID, when known
}

export function logRequestStart(fields: BaseLogFields): void {
  logger.info("request.start", { ...fields });
}

export function logRequestSuccess(
  fields: BaseLogFields & { provider?: string; durationMs: number }
): void {
  logger.info("request.success", { ...fields, outcome: "success" });
}

export function logRequestFailure(
  fields: BaseLogFields & {
    provider?: string;
    durationMs: number;
    errorCategory: string;
  }
): void {
  logger.warn("request.failure", { ...fields, outcome: "failure" });
}

/**
 * For genuinely unexpected errors only (bugs, not user/provider failures).
 * Logs the error's name/message for debugging but never assumes the message
 * is safe by construction — callers must not pass secrets in `err.message`.
 */
export function logUnexpectedError(fields: BaseLogFields, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("request.unexpected_error", { ...fields, message });
}
