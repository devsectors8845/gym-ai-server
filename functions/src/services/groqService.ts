import { defineSecret } from "firebase-functions/params";
import type { ChatMessage } from "../types/chat";
import { AIProviderError } from "../utils/errors";

/**
 * Declared as a Firebase Functions v2 secret (Secret Manager-backed) — never
 * a plain environment variable, never committed to source control. Set with:
 *   firebase functions:secrets:set GROQ_API_KEY
 * See functions/README.md for full setup. The value is only ever read
 * server-side via `GROQ_API_KEY.value()`, at request time, inside this file.
 */
export const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant"; // unchanged from the old client-side call
const REQUEST_TIMEOUT_MS = 25000;

/**
 * Sends a chat completion request to Groq and returns the assistant's reply
 * text. Throws `AIProviderError` (never a raw fetch/HTTP error) so callers
 * can handle every provider identically — see `services/aiService.ts`.
 */
export async function sendChat(messages: ChatMessage[]): Promise<string> {
  const apiKey = GROQ_API_KEY.value();
  if (!apiKey) {
    throw new AIProviderError("config", "Groq API key is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
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
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AIProviderError("timeout", "Groq request timed out.");
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new AIProviderError("network", "Could not reach Groq.", detail);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    throw new AIProviderError("rate_limit", "Groq rate limit hit.");
  }

  if (!response.ok) {
    const body = await safeReadText(response);
    // `body` is Groq's own error payload — it does not contain our secret,
    // but we still only attach it as a `detail` for server-side logs, never
    // returned to the client (see utils/errors.ts).
    throw new AIProviderError("upstream_error", `Groq responded with ${response.status}.`, body);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new AIProviderError("invalid_response", "Groq response was not valid JSON.");
  }

  const reply = extractReply(data);
  if (!reply) {
    throw new AIProviderError("invalid_response", "Groq response did not include a message.");
  }

  return reply;
}

function extractReply(data: unknown): string | undefined {
  if (
    data &&
    typeof data === "object" &&
    "choices" in data &&
    Array.isArray((data as { choices: unknown }).choices)
  ) {
    const choices = (data as { choices: Array<{ message?: { content?: unknown } }> }).choices;
    const content = choices[0]?.message?.content;
    if (typeof content === "string" && content.length > 0) {
      return content;
    }
  }
  return undefined;
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}
