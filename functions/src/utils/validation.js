"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_HISTORY_MESSAGES = exports.MAX_MESSAGE_LENGTH = void 0;
exports.validateChatRequest = validateChatRequest;
const https_1 = require("firebase-functions/v2/https");
exports.MAX_MESSAGE_LENGTH = 4000;
exports.MAX_HISTORY_MESSAGES = 10;
/**
 * Validates and sanitizes the raw `request.data` payload for `chatWithCoach`.
 *
 * This never forwards the client's payload to the AI provider unexamined
 * (Step 8): it checks types explicitly, rejects anything malformed, and
 * rebuilds a clean `{message, history}` object rather than passing the
 * input object through as-is (so an unexpected extra field — like a client
 * -supplied `userId` — is silently dropped rather than propagated anywhere).
 */
function validateChatRequest(data) {
    if (!data || typeof data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request payload is missing or malformed.");
    }
    const { message, history } = data;
    if (typeof message !== "string") {
        throw new https_1.HttpsError("invalid-argument", "A message string is required.");
    }
    const trimmed = message.trim();
    if (!trimmed) {
        throw new https_1.HttpsError("invalid-argument", "Message cannot be empty.");
    }
    if (message.length > exports.MAX_MESSAGE_LENGTH) {
        throw new https_1.HttpsError("invalid-argument", `Message is too long (max ${exports.MAX_MESSAGE_LENGTH} characters).`);
    }
    const safeHistory = sanitizeHistory(history);
    return { message: trimmed, history: safeHistory };
}
function sanitizeHistory(history) {
    if (!Array.isArray(history)) {
        return [];
    }
    const cleaned = [];
    for (const entry of history) {
        if (entry &&
            typeof entry === "object" &&
            ("role" in entry) &&
            ("content" in entry)) {
            const role = entry.role;
            const content = entry.content;
            if ((role === "user" || role === "assistant") && typeof content === "string") {
                cleaned.push({ role, content });
            }
        }
    }
    // Match the client's existing 10-turn cap (chatService.js) — keep the most
    // recent messages if the caller somehow sends more.
    return cleaned.slice(-exports.MAX_HISTORY_MESSAGES);
}
//# sourceMappingURL=validation.js.map