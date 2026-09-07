"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toHttpsError = exports.HttpsError = exports.HttpError = exports.AIProviderError = void 0;
exports.toHttpError = toHttpError;
class AIProviderError extends Error {
    constructor(category, message, detail) {
        super(message);
        this.name = "AIProviderError";
        this.category = category;
        this.detail = detail;
    }
}
exports.AIProviderError = AIProviderError;
class HttpError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "HttpError";
        this.code = code;
        this.httpStatus = httpStatusForCode(code);
    }
}
exports.HttpError = HttpError;
function httpStatusForCode(code) {
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
exports.HttpsError = HttpError;
/**
 * Maps any error a request handler might encounter into a clean, predictable
 * `HttpError` — never leaking a stack trace, provider response body, or
 * secret to the client (Step 9 / Step 10 requirements).
 *
 * Exposed as both `toHttpError` and `toHttpsError` (alias) so the same module
 * is importable from the legacy `firebase-functions` Cloud Functions code
 * path and from the standalone Express server.
 */
function toHttpError(err) {
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
exports.toHttpsError = toHttpError;
//# sourceMappingURL=errors.js.map