"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logRequestStart = logRequestStart;
exports.logRequestSuccess = logRequestSuccess;
exports.logRequestFailure = logRequestFailure;
exports.logUnexpectedError = logUnexpectedError;
const v2_1 = require("firebase-functions/v2");
function logRequestStart(fields) {
    v2_1.logger.info("request.start", { ...fields });
}
function logRequestSuccess(fields) {
    v2_1.logger.info("request.success", { ...fields, outcome: "success" });
}
function logRequestFailure(fields) {
    v2_1.logger.warn("request.failure", { ...fields, outcome: "failure" });
}
/**
 * For genuinely unexpected errors only (bugs, not user/provider failures).
 * Logs the error's name/message for debugging but never assumes the message
 * is safe by construction — callers must not pass secrets in `err.message`.
 */
function logUnexpectedError(fields, err) {
    const message = err instanceof Error ? err.message : String(err);
    v2_1.logger.error("request.unexpected_error", { ...fields, message });
}
//# sourceMappingURL=logging.js.map