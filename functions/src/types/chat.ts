/**
 * Shared types for the chat/coach AI feature.
 *
 * Kept intentionally small — this task establishes the secure backend
 * boundary and a swappable AI provider abstraction, not the richer
 * workout-context-aware chat described in the audit's future architecture.
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Shape of the data payload the React Native client sends to `chatWithCoach`. */
export interface ChatRequestData {
  message: string;
  /**
   * Prior turns of the conversation, exactly as `chatService.js` already
   * tracked them client-side before this migration. We do NOT persist server
   * -side history in this task (see functions/README.md) — the client is
   * still the source of truth for "what was said so far," it just no longer
   * talks to the AI provider directly.
   */
  history?: unknown;
}

/** Shape of the data this function returns to the client on success. */
export interface ChatResponseData {
  reply: string;
}
