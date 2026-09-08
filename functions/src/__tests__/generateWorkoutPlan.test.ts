import { type CallableRequest } from "firebase-functions/v2/https";
import { HttpError as HttpsError } from "../utils/errors";

jest.mock("../firestore/userRepository", () => ({
  getUserProfile: jest.fn(),
}));
jest.mock("../firestore/workoutRepository", () => ({
  saveGeneratedPlan: jest.fn(),
}));

import { generateWorkoutPlanHandler } from "../functions/generateWorkoutPlan";
import { getUserProfile } from "../firestore/userRepository";
import { saveGeneratedPlan } from "../firestore/workoutRepository";

const mockedGetUserProfile = getUserProfile as jest.MockedFunction<typeof getUserProfile>;
const mockedSaveGeneratedPlan = saveGeneratedPlan as jest.MockedFunction<typeof saveGeneratedPlan>;

const VALID_PROFILE = {
  goal: "Muscle Gain",
  gymExperience: "Intermediate",
  availableEquipment: ["Everything"],
  weeklyWorkoutCommitment: "4",
  modifications: "none",
  age: 25,
  gender: "Male",
  height: "175cm",
  weight: "75kg",
  fullName: "Test",
};

function fakeRequest(overrides: Partial<CallableRequest<unknown>> = {}): CallableRequest<unknown> {
  return {
    data: {},
    auth: { uid: "user-abc" } as CallableRequest<unknown>["auth"],
    ...overrides,
  } as CallableRequest<unknown>;
}

describe("generateWorkoutPlanHandler — authentication", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects an unauthenticated request", async () => {
    await expect(generateWorkoutPlanHandler(fakeRequest({ auth: undefined }))).rejects.toMatchObject({
      code: "unauthenticated",
    });
    expect(mockedGetUserProfile).not.toHaveBeenCalled();
  });

  it("always reads the profile for the authenticated uid, never a client-supplied id", async () => {
    mockedGetUserProfile.mockResolvedValueOnce(VALID_PROFILE);
    const req = fakeRequest({
      auth: { uid: "real-uid" } as CallableRequest<unknown>["auth"],
      data: { userId: "someone-elses-uid" },
    });
    await generateWorkoutPlanHandler(req);
    expect(mockedGetUserProfile).toHaveBeenCalledWith("real-uid");
  });
});

describe("generateWorkoutPlanHandler — profile problems (Step 9)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects with failed-precondition when no profile exists yet", async () => {
    mockedGetUserProfile.mockResolvedValueOnce(undefined);
    await expect(generateWorkoutPlanHandler(fakeRequest())).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(mockedSaveGeneratedPlan).not.toHaveBeenCalled();
  });

  it("rejects with failed-precondition on an unsupported stored goal, never silently substituting Build Muscle/muscle_gain", async () => {
    mockedGetUserProfile.mockResolvedValueOnce({ ...VALID_PROFILE, goal: "Get Shredded" });
    const err = await getRejection(generateWorkoutPlanHandler(fakeRequest()));
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe("failed-precondition");
    expect(mockedSaveGeneratedPlan).not.toHaveBeenCalled();
  });

  it("rejects with failed-precondition on missing equipment data", async () => {
    mockedGetUserProfile.mockResolvedValueOnce({ ...VALID_PROFILE, availableEquipment: [] });
    await expect(generateWorkoutPlanHandler(fakeRequest())).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  it("rejects with failed-precondition on an invalid frequency", async () => {
    mockedGetUserProfile.mockResolvedValueOnce({ ...VALID_PROFILE, weeklyWorkoutCommitment: "99" });
    await expect(generateWorkoutPlanHandler(fakeRequest())).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
});

describe("generateWorkoutPlanHandler — success path", () => {
  beforeEach(() => jest.clearAllMocks());

  it("generates, validates, saves, and returns a plan matching the profile's frequency", async () => {
    mockedGetUserProfile.mockResolvedValueOnce(VALID_PROFILE);
    mockedSaveGeneratedPlan.mockResolvedValueOnce(undefined);

    const result = await generateWorkoutPlanHandler(fakeRequest());

    expect(mockedSaveGeneratedPlan).toHaveBeenCalledTimes(1);
    expect(mockedSaveGeneratedPlan).toHaveBeenCalledWith("user-abc", expect.objectContaining({ planId: expect.any(String) }));
    expect(result.plan.goal).toBe("muscle_gain");
    expect(Object.keys(result.plan.daily_workouts)).toHaveLength(4);
    expect(result.planId).toBe(result.plan.planId);
  });

  it("never saves a plan that failed validation (Generate -> Validate -> Save, never Generate -> Save)", async () => {
    // A knee limitation + bodyweight-only equipment leaves the "arms" body
    // part with zero eligible exercises in the catalog, which should
    // surface as a controlled empty_pool rejection well before any save.
    mockedGetUserProfile.mockResolvedValueOnce({
      ...VALID_PROFILE,
      availableEquipment: ["Nothing"],
    });
    await expect(generateWorkoutPlanHandler(fakeRequest())).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(mockedSaveGeneratedPlan).not.toHaveBeenCalled();
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
