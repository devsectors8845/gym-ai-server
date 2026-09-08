import { HttpsError } from "firebase-functions/v2/https";
import { validateChatRequest, MAX_MESSAGE_LENGTH } from "../utils/validation";

describe("validateChatRequest", () => {
  it("accepts a valid message with no history", () => {
    const result = validateChatRequest({ message: "hello coach" });
    expect(result).toEqual({ message: "hello coach", history: [] });
  });

  it("trims whitespace from the message", () => {
    const result = validateChatRequest({ message: "  hi  " });
    expect(result.message).toBe("hi");
  });

  it("keeps well-formed history entries and drops malformed ones", () => {
    const result = validateChatRequest({
      message: "next question",
      history: [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "system", content: "should be dropped" }, // invalid role
        { role: "user" }, // missing content
        "not even an object",
      ],
    });
    expect(result.history).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
    ]);
  });

  it("caps history to the most recent 10 entries", () => {
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: "user" as const,
      content: `msg-${i}`,
    }));
    const result = validateChatRequest({ message: "hi", history });
    expect(result.history).toHaveLength(10);
    expect(result.history[0].content).toBe("msg-5");
  });

  it("rejects a missing payload", () => {
    expect(() => validateChatRequest(undefined)).toThrow(HttpsError);
  });

  it("rejects a non-string message", () => {
    expect(() => validateChatRequest({ message: 12345 })).toThrow(HttpsError);
  });

  it("rejects an empty message", () => {
    expect(() => validateChatRequest({ message: "   " })).toThrow(HttpsError);
  });

  it("rejects an excessively long message", () => {
    const tooLong = "a".repeat(MAX_MESSAGE_LENGTH + 1);
    expect(() => validateChatRequest({ message: tooLong })).toThrow(HttpsError);
  });

  it("ignores unexpected extra fields like a client-supplied userId", () => {
    const result = validateChatRequest({
      message: "hi",
      userId: "someone-elses-uid",
    } as never);
    expect(result).toEqual({ message: "hi", history: [] });
    expect(Object.keys(result)).not.toContain("userId");
  });
});
