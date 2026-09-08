"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GROQ_API_KEY = void 0;
exports.sendChat = sendChat;
const params_1 = require("firebase-functions/params");
const errors_1 = require("../utils/errors");
/**
 * Declared as a Firebase Functions v2 secret (Secret Manager-backed) — never
 * a plain environment variable, never committed to source control. Set with:
 *   firebase functions:secrets:set GROQ_API_KEY
 * See functions/README.md for full setup. The value is only ever read
 * server-side via `GROQ_API_KEY.value()`, at request time, inside this file.
 */
exports.GROQ_API_KEY = (0, params_1.defineSecret)("GROQ_API_KEY");
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant"; // unchanged from the old client-side call
const REQUEST_TIMEOUT_MS = 25000;
/**
 * Sends a chat completion request to Groq and returns the assistant's reply
 * text. Throws `AIProviderError` (never a raw fetch/HTTP error) so callers
 * can handle every provider identically — see `services/aiService.ts`.
 */
async function sendChat(messages) {
    const apiKey = exports.GROQ_API_KEY.value();
    if (!apiKey) {
        throw new errors_1.AIProviderError("config", "Groq API key is not configured.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages,
                temperature: 0.7,
                max_tokens: 1024,
            }),
            signal: controller.signal,
        });
    }
    catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            throw new errors_1.AIProviderError("timeout", "Groq request timed out.");
        }
        const detail = err instanceof Error ? err.message : String(err);
        throw new errors_1.AIProviderError("network", "Could not reach Groq.", detail);
    }
    finally {
        clearTimeout(timeout);
    }
    if (response.status === 429) {
        throw new errors_1.AIProviderError("rate_limit", "Groq rate limit hit.");
    }
    if (!response.ok) {
        const body = await safeReadText(response);
        // `body` is Groq's own error payload — it does not contain our secret,
        // but we still only attach it as a `detail` for server-side logs, never
        // returned to the client (see utils/errors.ts).
        throw new errors_1.AIProviderError("upstream_error", `Groq responded with ${response.status}.`, body);
    }
    let data;
    try {
        data = await response.json();
    }
    catch (err) {
        throw new errors_1.AIProviderError("invalid_response", "Groq response was not valid JSON.");
    }
    const reply = extractReply(data);
    if (!reply) {
        throw new errors_1.AIProviderError("invalid_response", "Groq response did not include a message.");
    }
    return reply;
}
function extractReply(data) {
    if (data &&
        typeof data === "object" &&
        "choices" in data &&
        Array.isArray(data.choices)) {
        const choices = data.choices;
        const content = choices[0]?.message?.content;
        if (typeof content === "string" && content.length > 0) {
            return content;
        }
    }
    return undefined;
}
async function safeReadText(response) {
    try {
        return await response.text();
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=groqService.js.map