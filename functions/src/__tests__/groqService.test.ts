import { AIProviderError } from "../utils/errors";

// `defineSecret` is mocked so the test controls what `.value()` returns,
// without needing a real Secret Manager value or the Functions emulator.
let mockSecretValue = "test-groq-key";
jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn(() => ({ value: () => mockSecretValue })),
}));

import { sendChat } from "../services/groqService";

const originalFetch = global.fetch;

function mockFetchOnce(impl: () => Promise<Partial<Response>> | Partial<Response>) {
  // @ts-expect-error - test double, not a full Response implementation
  global.fetch = jest.fn(async () => impl());
}

describe("groqService.sendChat", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    mockSecretValue = "test-groq-key";
    jest.clearAllMocks();
  });

  it("returns the assistant's reply on a successful call", async () => {
    mockFetchOnce(() => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "Do 3 sets of squats." } }] }),
    }));

    const reply = await sendChat([{ role: "user", content: "what should I do today?" }]);
    expect(reply).toBe("Do 3 sets of squats.");
  });

  it("sends the Authorization header built from the secret, never a hardcoded value", async () => {
    mockSecretValue = "sk-test-secret-value";
    let capturedHeaders: Record<string, string> | undefined;
    mockFetchOnce(() => {
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
    });
    // Re-mock to capture args this time.
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "ok" } }] }) } as Response;
    });

    await sendChat([{ role: "user", content: "hi" }]);
    expect(capturedHeaders?.Authorization).toBe("Bearer sk-test-secret-value");
  });

  it("throws a 'config' AIProviderError when the secret is empty", async () => {
    mockSecretValue = "";
    await expect(sendChat([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      category: "config",
    });
    expect(await getError()).toBeInstanceOf(AIProviderError);

    async function getError() {
      try {
        await sendChat([{ role: "user", content: "hi" }]);
      } catch (e) {
        return e;
      }
    }
  });

  it("throws a 'rate_limit' AIProviderError on HTTP 429", async () => {
    mockFetchOnce(() => ({ ok: false, status: 429, text: async () => "rate limited" }));
    await expect(sendChat([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      category: "rate_limit",
    });
  });

  it("throws an 'upstream_error' AIProviderError on a non-2xx, non-429 response", async () => {
    mockFetchOnce(() => ({ ok: false, status: 500, text: async () => "server error" }));
    await expect(sendChat([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      category: "upstream_error",
    });
  });

  it("throws an 'invalid_response' AIProviderError when the body has no message content", async () => {
    mockFetchOnce(() => ({ ok: true, status: 200, json: async () => ({ choices: [] }) }));
    await expect(sendChat([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      category: "invalid_response",
    });
  });

  it("throws a 'timeout' AIProviderError when the request aborts", async () => {
    global.fetch = jest.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    await expect(sendChat([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      category: "timeout",
    });
  });

  it("throws a 'network' AIProviderError when the request fails to connect", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.groq.com");
    });
    await expect(sendChat([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      category: "network",
    });
  });
});
