"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_PROVIDER = void 0;
exports.getChatReply = getChatReply;
exports.getActiveProviderName = getActiveProviderName;
const params_1 = require("firebase-functions/params");
const groqService = __importStar(require("./groqService"));
const openAIService = __importStar(require("./openAIService"));
const PROVIDERS = {
    groq: groqService,
    openai: openAIService,
};
/**
 * Which provider is active. A plain (non-secret) Functions param, so it can
 * be changed via `firebase deploy` / the console without touching code.
 * Defaults to "groq" — the provider already in production use today.
 */
exports.AI_PROVIDER = (0, params_1.defineString)("AI_PROVIDER", { default: "groq" });
function getChatReply(messages) {
    const providerName = exports.AI_PROVIDER.value();
    const provider = PROVIDERS[providerName];
    if (!provider) {
        // Falls back to Groq rather than failing outright on a typo'd param —
        // logged by the caller via the returned provider name mismatch if ever
        // needed, but kept simple here since this is a deploy-time config value,
        // not user input.
        return groqService.sendChat(messages);
    }
    return provider.sendChat(messages);
}
function getActiveProviderName() {
    return PROVIDERS[exports.AI_PROVIDER.value()] ? exports.AI_PROVIDER.value() : "groq";
}
//# sourceMappingURL=aiService.js.map