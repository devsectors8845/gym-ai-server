/**
 * Error categories an AI provider call can fail with, independent of which
 * provider (Groq, OpenAI, ...) actually produced the failure. Every
 * `services/*Service.ts` implementation throws one of these instead of a
 * raw fetch/HTTP error, so `functions/chatWithCoach.ts` (and any future AI
 * function) can map failures to client-safe responses in exactly one place,
 * regardless of provider.
 */
export type AIErrorCategory =
  | "config" // a required secret/config value was missing or empty
  | "rate_limit" // provider returned 429 / told us to slow down
  | "timeout" // our own request timeout fired before the provider responded
  | "network" // the request never reached the provider (DNS/connection/etc.)
  | "invalid_response" // provider responded 2xx but the body wasn't usable
  | "upstream_error"; // provider responded with a non-2xx, non-429 error

export class AIProviderError extends Error {
  readonly category: AIErrorCategory;
  /** Optional non-sensitive detail for server-side logs only (never sent to the client). */
  readonly detail?: string;

  constructor(category: AIErrorCategory, message: string, detail?: string) {
    super(message);
    this.name = "AIProviderError";
    this.category = category;
    this.detail = detail;
  }
}

export type HttpErrorCode =
  | "unauthenticated"
  | "failed-precondition"
  | "resource-exhausted"
  | "deadline-exceeded"
  | "unavailable"
  | "internal"
  | "invalid-argument";

export class HttpError extends Error {
  readonly code: HttpErrorCode;
  readonly httpStatus: number;
  constructor(code: HttpErrorCode, message: string) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.httpStatus = httpStatusForCode(code);
  }
}

function httpStatusForCode(code: HttpErrorCode): number {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "invalid-argument":
      return 400;
    case "failed-precondition":
      return 412;
    case "resource-exhausted":
      return 429;
    case "deadline-exceeded":
      return 504;
    case "unavailable":
      return 503;
    case "internal":
    default:
      return 500;
  }
}

/**
 * Backwards-compatible alias: the Cloud Functions code path historically
 * imported `HttpsError` from `firebase-functions/v2/https`. We no longer
 * depend on that module from this file so the same workout engine can run
 * unchanged in a standalone Express server (Vercel), a Cloud Function, or
 * any other handler. New code should import `HttpError` directly.
 */
export const HttpsError = HttpError;

/**
 * Maps any error a request handler might encounter into a clean, predictable
 * `HttpError` — never leaking a stack trace, provider response body, or
 * secret to the client (Step 9 / Step 10 requirements).
 *
 * Exposed as both `toHttpError` and `toHttpsError` (alias) so the same module
 * is importable from the legacy `firebase-functions` Cloud Functions code
 * path and from the standalone Express server.
 */
export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) {
    return err;
  }

  if (err instanceof AIProviderError) {
    switch (err.category) {
      case "rate_limit":
        return new HttpError("resource-exhausted", "Too many requests. Please slow down.");
      case "timeout":
        return new HttpError("deadline-exceeded", "The request took too long. Please try again.");
      case "network":
        return new HttpError("unavailable", "Could not reach the chat service. Please try again.");
      case "config":
        return new HttpError("internal", "The chat service is temporarily unavailable.");
      case "invalid_response":
      case "upstream_error":
      default:
        return new HttpError("internal", "Failed to get a response. Please try again.");
    }
  }

  return new HttpError("internal", "Something went wrong. Please try again.");
}

/** Alias kept for callers that historically imported the Cloud Functions name. */
export const toHttpsError = toHttpError;
