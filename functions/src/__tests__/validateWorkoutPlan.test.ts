import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

jest.mock("../firestore/userRepository", () => ({
  getUserProfile: jest.fn(),
}));

import { validateWorkoutPlanHandler } from "../functions/validateWorkoutPlan";
import { getUserProfile } from "../firestore/userRepository";

const mockedGetUserProfile = getUserProfile as jest.MockedFunction<typeof getUserProfile>;

function fakeRequest(data: unknown, auth: unknown = { uid: "user-1" }): CallableRequest<any> {
  return { data, auth } as CallableRequest<any>;
}

describe("validateWorkoutPlanHandler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects an unauthenticated request", async () => {
    await expect(validateWorkoutPlanHandler(fakeRequest({ dailyWorkouts: {} }, null))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("rejects a malformed payload", async () => {
    await expect(validateWorkoutPlanHandler(fakeRequest({}))).rejects.toBeInstanceOf(HttpsError);
    await expect(validateWorkoutPlanHandler(fakeRequest(undefined))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("flags an empty plan", async () => {
    mockedGetUserProfile.mockResolvedValueOnce({ availableEquipment: ["Everything"], modifications: "none" });
    const result = await validateWorkoutPlanHandler(fakeRequest({ dailyWorkouts: {} }));
    expect(result.valid).toBe(false);
  });

  it("flags a manually-entered exercise that matches a catalog entry contraindicated for a reported limitation", async () => {
    mockedGetUserProfile.mockResolvedValueOnce({
      availableEquipment: ["Everything"],
      modifications: "Knee pain, avoid squats",
    });
    const result = await validateWorkoutPlanHandler(
      fakeRequest({
        dailyWorkouts: {
          "Day 1": [{ name: "Barbell Back Squat", bodyPart: "legs", equipment: "barbell" }],
        },
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("contraindicated"))).toBe(true);
  });

  it("flags a manually-entered exercise requiring equipment the user doesn't have", async () => {
    mockedGetUserProfile.mockResolvedValueOnce({
      availableEquipment: ["Dumbells"],
      modifications: "none",
    });
    const result = await validateWorkoutPlanHandler(
      fakeRequest({
        dailyWorkouts: {
          "Day 1": [{ name: "Barbell Bench Press", bodyPart: "chest", equipment: "barbell" }],
        },
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("equipment"))).toBe(true);
  });

  it("allows a safe, catalog-matched exercise and passes validation", async () => {
    mockedGetUserProfile.mockResolvedValueOnce({
      availableEquipment: ["Dumbells"],
      modifications: "none",
    });
    const result = await validateWorkoutPlanHandler(
      fakeRequest({
        dailyWorkouts: {
          "Day 1": [{ name: "Dumbbell Bench Press", bodyPart: "chest", equipment: "dumbbell" }],
        },
      })
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("warns (does not error) on a custom exercise name with no catalog match", async () => {
    mockedGetUserProfile.mockResolvedValueOnce({ availableEquipment: ["Everything"], modifications: "none" });
    const result = await validateWorkoutPlanHandler(
      fakeRequest({
        dailyWorkouts: {
          "Day 1": [{ name: "My Custom Garage Gym Move", bodyPart: "chest", equipment: "other" }],
        },
      })
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects an exercise entry with no name", async () => {
    mockedGetUserProfile.mockResolvedValueOnce({ availableEquipment: ["Everything"], modifications: "none" });
    const result = await validateWorkoutPlanHandler(
      fakeRequest({ dailyWorkouts: { "Day 1": [{ bodyPart: "chest" }] } })
    );
    expect(result.valid).toBe(false);
  });
});
