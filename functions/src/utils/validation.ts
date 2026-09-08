import { HttpsError } from "firebase-functions/v2/https";
import type { ChatMessage, ChatRequestData } from "../types/chat";

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_HISTORY_MESSAGES = 10;

/**
 * Validates and sanitizes the raw `request.data` payload for `chatWithCoach`.
 *
 * This never forwards the client's payload to the AI provider unexamined
 * (Step 8): it checks types explicitly, rejects anything malformed, and
 * rebuilds a clean `{message, history}` object rather than passing the
 * input object through as-is (so an unexpected extra field — like a client
 * -supplied `userId` — is silently dropped rather than propagated anywhere).
 */
export function validateChatRequest(data: unknown): { message: string; history: ChatMessage[] } {
  if (!data || typeof data !== "object") {
    throw new HttpsError("invalid-argument", "Request payload is missing or malformed.");
  }

  const { message, history } = data as ChatRequestData;

  if (typeof message !== "string") {
    throw new HttpsError("invalid-argument", "A message string is required.");
  }

  const trimmed = message.trim();
  if (!trimmed) {
    throw new HttpsError("invalid-argument", "Message cannot be empty.");
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`
    );
  }

  const safeHistory = sanitizeHistory(history);

  return { message: trimmed, history: safeHistory };
}

function sanitizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  const cleaned: ChatMessage[] = [];
  for (const entry of history) {
    if (
      entry &&
      typeof entry === "object" &&
      (("role" in entry) as boolean) &&
      (("content" in entry) as boolean)
    ) {
      const role = (entry as Record<string, unknown>).role;
      const content = (entry as Record<string, unknown>).content;
      if ((role === "user" || role === "assistant") && typeof content === "string") {
        cleaned.push({ role, content });
      }
    }
  }

  // Match the client's existing 10-turn cap (chatService.js) — keep the most
  // recent messages if the caller somehow sends more.
  return cleaned.slice(-MAX_HISTORY_MESSAGES);
}
