"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPENAI_API_KEY = void 0;
exports.sendChat = sendChat;
const params_1 = require("firebase-functions/params");
const errors_1 = require("../utils/errors");
/**
 * NOT currently wired up as the active provider (see `services/aiService.ts`
 * — `AI_PROVIDER` defaults to "groq"), and NOT attached to `chatWithCoach`'s
 * `secrets` array by default. This exists to prove the provider abstraction
 * is real and swappable, per this task's requirement, without deploying an
 * OpenAI integration nobody has asked to use yet.
 *
 * The OpenAI key that used to sit unused in the mobile app's `.env` was
 * flagged for revocation in the credential-migration task and should NOT be
 * reused here — generate a fresh key if/when this provider is actually
 * switched on, and add it to `chatWithCoach`'s `secrets: [...]` array in
 * `functions/src/functions/chatWithCoach.ts` before deploying with
 * `AI_PROVIDER=openai`.
 */
exports.OPENAI_API_KEY = (0, params_1.defineSecret)("OPENAI_API_KEY");
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 25000;
async function sendChat(messages) {
    const apiKey = exports.OPENAI_API_KEY.value();
    if (!apiKey) {
        throw new errors_1.AIProviderError("config", "OpenAI API key is not configured.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: OPENAI_MODEL,
                messages,
                temperature: 0.7,
                max_tokens: 1024,
            }),
            signal: controller.signal,
        });
    }
    catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            throw new errors_1.AIProviderError("timeout", "OpenAI request timed out.");
        }
        const detail = err instanceof Error ? err.message : String(err);
        throw new errors_1.AIProviderError("network", "Could not reach OpenAI.", detail);
    }
    finally {
        clearTimeout(timeout);
    }
    if (response.status === 429) {
        throw new errors_1.AIProviderError("rate_limit", "OpenAI rate limit hit.");
    }
    if (!response.ok) {
        const body = await safeReadText(response);
        throw new errors_1.AIProviderError("upstream_error", `OpenAI responded with ${response.status}.`, body);
    }
    let data;
    try {
        data = await response.json();
    }
    catch {
        throw new errors_1.AIProviderError("invalid_response", "OpenAI response was not valid JSON.");
    }
    const reply = extractReply(data);
    if (!reply) {
        throw new errors_1.AIProviderError("invalid_response", "OpenAI response did not include a message.");
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
//# sourceMappingURL=openAIService.js.map