"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWithCoach = void 0;
exports.chatWithCoachHandler = chatWithCoachHandler;
/**
 * The AI chat callable function.
 *
 * RETENTION NOTE — current release does NOT export this from `src/index.ts`,
 * so it is not deployed. The Spark (free) Firebase plan blocks outbound
 * network calls to third-party APIs (Groq, OpenAI), which this function
 * requires. The handler, provider services (`services/aiService.ts`,
 * `groqService.ts`, `openAIService.ts`), and chat types are intentionally
 * preserved here for a future release, when either:
 *   (a) the project upgrades to the Blaze plan, or
 *   (b) the function is ported to a standalone Node server (e.g. Express).
 *
 * The React Native client no longer references this function (the AI Chat
 * tab and `chatService.js` were removed in the current release), so the
 * function being un-deployed is a no-op for end users.
 *
 * Restoring: uncomment the export line in `src/index.ts`, set the
 * `GROQ_API_KEY` secret (`firebase functions:secrets:set GROQ_API_KEY`),
 * upgrade to Blaze, and re-deploy.
 */
const https_1 = require("firebase-functions/v2/https");
const groqService_1 = require("../services/groqService");
const aiService_1 = require("../services/aiService");
const validation_1 = require("../utils/validation");
const errors_1 = require("../utils/errors");
const logging_1 = require("../utils/logging");
const FUNCTION_NAME = "chatWithCoach";
/**
 * The actual request-handling logic, exported separately from the `onCall`
 * wrapper below so it can be unit-tested directly (see
 * `src/__tests__/chatWithCoach.test.ts`) without needing the Functions
 * emulator or a real deploy.
 */
async function chatWithCoachHandler(request) {
    const startedAt = Date.now();
    // 1. Require a signed-in Firebase Auth user. The mobile app already
    //    authenticates every user via @react-native-firebase/auth before they
    //    can reach the chat screen, so this should never legitimately fail —
    //    it exists to stop this function being called by anyone who isn't a
    //    real, authenticated app user. The UID always comes from the verified
    //    auth context, never from `request.data` — a client cannot claim to
    //    be a different user by putting a `userId` field in the payload; this
    //    handler never reads one.
    if (!request.auth?.uid) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to use the chatbot.");
    }
    const uid = request.auth.uid;
    (0, logging_1.logRequestStart)({ fn: FUNCTION_NAME, uid });
    // 2. Validate input before spending a network call on it (Step 8). Throws
    //    HttpsError('invalid-argument', ...) on anything malformed.
    const { message, history } = (0, validation_1.validateChatRequest)(request.data);
    // 3. Call the AI provider through the swappable service abstraction.
    try {
        const reply = await (0, aiService_1.getChatReply)([...history, { role: "user", content: message }]);
        (0, logging_1.logRequestSuccess)({
            fn: FUNCTION_NAME,
            uid,
            provider: (0, aiService_1.getActiveProviderName)(),
            durationMs: Date.now() - startedAt,
        });
        return { reply };
    }
    catch (err) {
        const category = err instanceof errors_1.AIProviderError ? err.category : "unexpected";
        (0, logging_1.logRequestFailure)({
            fn: FUNCTION_NAME,
            uid,
            provider: (0, aiService_1.getActiveProviderName)(),
            durationMs: Date.now() - startedAt,
            errorCategory: category,
        });
        if (!(err instanceof errors_1.AIProviderError) && !(err instanceof https_1.HttpsError)) {
            // Something we didn't anticipate — log a bit more for debugging, but
            // the client still only ever gets the generic mapped message below.
            (0, logging_1.logUnexpectedError)({ fn: FUNCTION_NAME, uid }, err);
        }
        throw (0, errors_1.toHttpsError)(err);
    }
}
/**
 * The deployed Cloud Function. `secrets` declares exactly the secret this
 * function is allowed to read — Groq's key, since "groq" is the default
 * active provider (see `services/aiService.ts`). Switching the `AI_PROVIDER`
 * param to "openai" also requires adding `OPENAI_API_KEY` here before
 * redeploying (see `services/openAIService.ts`).
 */
exports.chatWithCoach = (0, https_1.onCall)({
    secrets: [groqService_1.GROQ_API_KEY],
    timeoutSeconds: 30,
}, chatWithCoachHandler);
//# sourceMappingURL=chatWithCoach.js.map