import { defineString } from "firebase-functions/params";
import type { ChatMessage } from "../types/chat";
import * as groqService from "./groqService";
import * as openAIService from "./openAIService";

/**
 * Provider-agnostic AI service facade.
 *
 * Cloud Functions (e.g. `chatWithCoach`) call `getChatReply(...)` and never
 * import `groqService`/`openAIService` directly — this is the one place
 * that knows which provider is active, so switching providers later means
 * changing this file (or the `AI_PROVIDER` param at deploy time), not
 * rewriting every function that needs an AI response:
 *
 *   Cloud Function → aiService → Groq / OpenAI
 *
 * Not a generic "workout AI" abstraction yet (see the audit's future
 * architecture for AI-assisted plan personalization/validation) — this is
 * scoped to the one thing currently migrated: chat completions.
 */

export interface AIProvider {
  sendChat(messages: ChatMessage[]): Promise<string>;
}

const PROVIDERS: Record<string, AIProvider> = {
  groq: groqService,
  openai: openAIService,
};

/**
 * Which provider is active. A plain (non-secret) Functions param, so it can
 * be changed via `firebase deploy` / the console without touching code.
 * Defaults to "groq" — the provider already in production use today.
 */
export const AI_PROVIDER = defineString("AI_PROVIDER", { default: "groq" });

export function getChatReply(messages: ChatMessage[]): Promise<string> {
  const providerName = AI_PROVIDER.value();
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

export function getActiveProviderName(): string {
  return PROVIDERS[AI_PROVIDER.value()] ? AI_PROVIDER.value() : "groq";
}
