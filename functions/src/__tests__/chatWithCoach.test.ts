import { type CallableRequest } from "firebase-functions/v2/https";
import { HttpError as HttpsError } from "../utils/errors";
import type { ChatRequestData } from "../types/chat";

jest.mock("../services/aiService", () => ({
  getChatReply: jest.fn(),
  getActiveProviderName: jest.fn(() => "groq"),
}));
jest.mock("../utils/logging", () => ({
  logRequestStart: jest.fn(),
  logRequestSuccess: jest.fn(),
  logRequestFailure: jest.fn(),
  logUnexpectedError: jest.fn(),
}));

import { chatWithCoachHandler } from "../functions/chatWithCoach";
import { getChatReply } from "../services/aiService";
import { logRequestStart, logRequestSuccess, logRequestFailure } from "../utils/logging";
import { AIProviderError } from "../utils/errors";

const mockedGetChatReply = getChatReply as jest.MockedFunction<typeof getChatReply>;

function fakeRequest(overrides: Partial<CallableRequest<ChatRequestData>>): CallableRequest<ChatRequestData> {
  return {
    data: { message: "hi" },
    auth: { uid: "user-123" } as CallableRequest<ChatRequestData>["auth"],
    ...overrides,
  } as CallableRequest<ChatRequestData>;
}

describe("chatWithCoachHandler — authentication", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects an unauthenticated request", async () => {
    const req = fakeRequest({ auth: undefined });
    await expect(chatWithCoachHandler(req)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(mockedGetChatReply).not.toHaveBeenCalled();
  });

  it("allows an authenticated user to call the function", async () => {
    mockedGetChatReply.mockResolvedValueOnce("You're doing great!");
    const req = fakeRequest({});
    const result = await chatWithCoachHandler(req);
    expect(result).toEqual({ reply: "You're doing great!" });
  });

  it("always uses the authenticated UID, never a client-supplied userId, for logging/identity", async () => {
    mockedGetChatReply.mockResolvedValueOnce("ok");
    const req = fakeRequest({
      auth: { uid: "real-uid" } as CallableRequest<ChatRequestData>["auth"],
      data: { message: "hi", userId: "someone-elses-uid" } as unknown as ChatRequestData,
    });

    await chatWithCoachHandler(req);

    expect(logRequestStart).toHaveBeenCalledWith(expect.objectContaining({ uid: "real-uid" }));
    expect(logRequestSuccess).toHaveBeenCalledWith(expect.objectContaining({ uid: "real-uid" }));
  });
});

describe("chatWithCoachHandler — input validation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("succeeds with a valid message", async () => {
    mockedGetChatReply.mockResolvedValueOnce("reply text");
    const result = await chatWithCoachHandler(fakeRequest({ data: { message: "How many sets today?" } }));
    expect(result).toEqual({ reply: "reply text" });
  });

  it("rejects an empty message", async () => {
    await expect(chatWithCoachHandler(fakeRequest({ data: { message: "   " } }))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("rejects a malformed payload (message not a string)", async () => {
    await expect(
      chatWithCoachHandler(fakeRequest({ data: { message: 42 } as unknown as ChatRequestData }))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects an excessively large message", async () => {
    const huge = "a".repeat(10000);
    await expect(chatWithCoachHandler(fakeRequest({ data: { message: huge } }))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("chatWithCoachHandler — AI provider error handling", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps a rate_limit provider error to resource-exhausted, without the client seeing internals", async () => {
    mockedGetChatReply.mockRejectedValueOnce(new AIProviderError("rate_limit", "Groq rate limit hit."));
    await expect(chatWithCoachHandler(fakeRequest({}))).rejects.toMatchObject({
      code: "resource-exhausted",
    });
  });

  it("maps a timeout provider error to deadline-exceeded", async () => {
    mockedGetChatReply.mockRejectedValueOnce(new AIProviderError("timeout", "Groq request timed out."));
    await expect(chatWithCoachHandler(fakeRequest({}))).rejects.toMatchObject({
      code: "deadline-exceeded",
    });
  });

  it("maps a network provider error to unavailable", async () => {
    mockedGetChatReply.mockRejectedValueOnce(new AIProviderError("network", "Could not reach Groq."));
    await expect(chatWithCoachHandler(fakeRequest({}))).rejects.toMatchObject({ code: "unavailable" });
  });

  it("maps a missing-secret ('config') provider error to a generic internal error, without mentioning secrets", async () => {
    mockedGetChatReply.mockRejectedValueOnce(new AIProviderError("config", "Groq API key is not configured."));
    const err = await getRejection(chatWithCoachHandler(fakeRequest({})));
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe("internal");
    expect((err as HttpsError).message.toLowerCase()).not.toMatch(/key|secret|groq/);
  });

  it("maps an unexpected/unknown error to a generic internal error and logs failure metadata", async () => {
    mockedGetChatReply.mockRejectedValueOnce(new Error("something exploded"));
    await expect(chatWithCoachHandler(fakeRequest({}))).rejects.toMatchObject({ code: "internal" });
    expect(logRequestFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: "unexpected" })
    );
  });
});

async function getRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error("expected promise to reject");
}
