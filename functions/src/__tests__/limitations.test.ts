import { parseLimitations } from "../constants/limitations";

describe("parseLimitations", () => {
  it("returns an empty array for empty/none/absent input", () => {
    expect(parseLimitations(undefined)).toEqual([]);
    expect(parseLimitations("")).toEqual([]);
    expect(parseLimitations("None")).toEqual([]);
    expect(parseLimitations("N/A")).toEqual([]);
  });

  it("detects a knee limitation", () => {
    expect(parseLimitations("Knee pain, avoid deep squats")).toEqual(["knee"]);
  });

  it("detects a shoulder limitation", () => {
    expect(parseLimitations("I have a rotator cuff injury")).toContain("shoulder");
  });

  it("detects multiple limitations in one note", () => {
    const result = parseLimitations("Bad knee and a wrist injury from a fall");
    expect(result.sort()).toEqual(["knee", "wrist"].sort());
  });

  it("is case-insensitive", () => {
    expect(parseLimitations("KNEE PAIN")).toEqual(["knee"]);
  });

  it("does not flag an explicit negation of a keyword", () => {
    expect(parseLimitations("No knee issues, all good")).toEqual([]);
  });

  it("deduplicates repeated mentions of the same limitation", () => {
    expect(parseLimitations("My knee hurts, especially my knee cap")).toEqual(["knee"]);
  });
});
