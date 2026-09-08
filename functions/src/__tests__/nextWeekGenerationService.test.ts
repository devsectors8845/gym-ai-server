import { NextWeekGenerationError } from "../services/nextWeekGenerationService";

jest.mock("../firestore/admin", () => ({
  db: {
    collection: jest.fn(),
  },
}));

jest.mock("../firestore/userRepository", () => ({
  getUserProfile: jest.fn(),
  getCurrentWorkoutPlan: jest.fn(),
}));

jest.mock("../firestore/planHistoryRepository", () => ({
  archivePlanVersion: jest.fn(),
  savePlanVersion: jest.fn(),
}));

jest.mock("../firestore/workoutRepository", () => ({
  saveGeneratedPlan: jest.fn(),
}));

jest.mock("../services/profileService", () => ({
  normalizeProfile: jest.fn((profile) => profile),
}));

jest.mock("../services/planBuilder", () => ({
  buildPlan: jest.fn(),
  PLAN_SCHEMA_VERSION: 1,
}));

jest.mock("../services/weekAnalysisService", () => ({
  analyzeWorkoutWeek: jest.fn(),
}));

jest.mock("../services/progressionService", () => ({
  calculateProgression: jest.fn(),
  applyProgressionAdjustments: jest.fn((plan, progression, profile) => plan),
}));

jest.mock("../utils/planValidation", () => ({
  validateGeneratedPlan: jest.fn(() => ({ valid: true, errors: [] })),
}));

jest.mock("firebase-functions/v2", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("firebase-functions", () => ({
  https: {
    HttpsError: class HttpsError extends Error {
      constructor(public code: string, message: string) {
        super(message);
        this.name = "HttpsError";
      }
    },
    onCall: jest.fn((handler) => handler),
  },
  ...(requireActual("firebase-functions") as any),
}));

function requireActual(mod: string) {
  return jest.requireActual(mod);
}

const { db } = require("../firestore/admin");
const { getUserProfile, getCurrentWorkoutPlan } = require("../firestore/userRepository");
const { buildPlan } = require("../services/planBuilder");
const { analyzeWorkoutWeek } = require("../services/weekAnalysisService");
const { calculateProgression, applyProgressionAdjustments } = require("../services/progressionService");
const { validateGeneratedPlan } = require("../utils/planValidation");

describe("nextWeekGenerationService — checkWeekEligibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns not eligible when no plan exists", async () => {
    (getCurrentWorkoutPlan as jest.Mock).mockResolvedValue(undefined);

    const { checkWeekEligibility } = require("../services/nextWeekGenerationService");
    const result = await checkWeekEligibility("uid-test");

    expect(result.isEligible).toBe(false);
    expect(result.reason).toContain("No active workout plan");
  });

  it("returns not ready when plan is not yet due", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    (getCurrentWorkoutPlan as jest.Mock).mockResolvedValue({
      planId: "current-plan",
      weekNumber: 1,
      plan: { planId: "current-plan", generatedAt: new Date().toISOString() },
      weekStart: { toDate: () => new Date() },
      nextPlanDue: { toDate: () => futureDate },
      createdAt: new Date().toISOString(),
    });

    const { db: mockDb } = require("../firestore/admin");
    mockDb.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
            })),
          })),
        })),
      })),
    });

    const { checkWeekEligibility } = require("../services/nextWeekGenerationService");
    const result = await checkWeekEligibility("uid-test");

    expect(result.isEligible).toBe(false);
    expect(result.reason).toContain("not yet complete");
  });

  it("returns not eligible when next week already exists", async () => {
    const pastDate = new Date(Date.now() - 1000);
    (getCurrentWorkoutPlan as jest.Mock).mockResolvedValue({
      planId: "current-plan",
      weekNumber: 1,
      plan: { planId: "current-plan", generatedAt: new Date().toISOString() },
      weekStart: { toDate: () => new Date() },
      nextPlanDue: { toDate: () => pastDate },
      previousPlanId: null,
      createdAt: new Date().toISOString(),
    });

    const { db: mockDb } = require("../firestore/admin");
    mockDb.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [{ data: () => ({ planId: "next-plan", previousPlanId: "current-plan" }) }],
              }),
            })),
          })),
        })),
      })),
    });

    const { checkWeekEligibility } = require("../services/nextWeekGenerationService");
    const result = await checkWeekEligibility("uid-test");

    expect(result.isEligible).toBe(false);
    expect(result.reason).toContain("already exists");
  });

  it("returns eligible when plan is due and next week doesn't exist", async () => {
    const pastDate = new Date(Date.now() - 1000);
    (getCurrentWorkoutPlan as jest.Mock).mockResolvedValue({
      planId: "current-plan",
      weekNumber: 1,
      plan: { planId: "current-plan", generatedAt: new Date().toISOString() },
      weekStart: { toDate: () => new Date() },
      nextPlanDue: { toDate: () => pastDate },
      previousPlanId: null,
      createdAt: new Date().toISOString(),
    });

    const { db: mockDb } = require("../firestore/admin");
    mockDb.collection.mockReturnValue({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
            })),
          })),
        })),
      })),
    });

    const { checkWeekEligibility } = require("../services/nextWeekGenerationService");
    const result = await checkWeekEligibility("uid-test");

    expect(result.isEligible).toBe(true);
    expect(result.currentWeekNumber).toBe(1);
    expect(result.currentPlanId).toBe("current-plan");
  });
});

describe("nextWeekGenerationService — generateNextWeekPlanService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentWorkoutPlan as jest.Mock).mockResolvedValue({
      planId: "current-plan",
      weekNumber: 1,
      plan: { planId: "current-plan", generatedAt: new Date().toISOString() },
      weekStart: { toDate: () => new Date() },
      nextPlanDue: { toDate: () => new Date(Date.now() - 1000) },
      previousPlanId: null,
      createdAt: new Date().toISOString(),
    });
    (getUserProfile as jest.Mock).mockResolvedValue({
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
    });
    (analyzeWorkoutWeek as jest.Mock).mockResolvedValue({
      userId: "uid-test",
      planId: "current-plan",
      planVersion: 1,
      weekNumber: 1,
      analyzedAt: new Date().toISOString(),
      totalPlannedWorkouts: 4,
      completedWorkouts: 4,
      skippedWorkouts: 0,
      partialWorkouts: 0,
      completionPercentage: 100,
      totalDuration: 3600,
      totalWeight: 10000,
      totalReps: 160,
      avgRpe: 6,
      avgDifficulty: 3,
      painReports: 0,
      exercises: [],
      overallRecommendation: "progress",
      recommendationReason: "Good performance",
    });
    (calculateProgression as jest.Mock).mockReturnValue({
      planId: "new-plan",
      previousPlanId: "current-plan",
      weekNumber: 2,
      adjustments: [],
      safetyFlags: [],
      requiresManualReview: false,
    });
    (buildPlan as jest.Mock).mockReturnValue({
      planId: "temp",
      schemaVersion: 1,
      userProfile: {},
      goal: "muscle_gain",
      weekly_split: [],
      daily_workouts: {},
      warmup: [],
      cooldown: [],
      workout_guidelines: [],
      recovery: [],
      nutrition: {},
      generatedAt: new Date().toISOString(),
      source: "Deterministic Workout Engine",
      weekNumber: 2,
      previousPlanId: "current-plan",
    });
    (applyProgressionAdjustments as jest.Mock).mockImplementation((plan) => plan);
    (validateGeneratedPlan as jest.Mock).mockReturnValue({ valid: true, errors: [] });
  });

  it("throws when no active plan exists", async () => {
    const { db: mockDb } = require("../firestore/admin");
    const mockLockRef = {
      get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockDb.collection.mockReturnValue({
      doc: jest.fn(() => mockLockRef),
    });
    (getCurrentWorkoutPlan as jest.Mock).mockResolvedValue(undefined);

    const { generateNextWeekPlanService } = require("../services/nextWeekGenerationService");
    await expect(generateNextWeekPlanService("uid-no-plan")).rejects.toThrow(
      "No active workout plan found."
    );
  });

  it("throws when next week already exists", async () => {
    const { db: mockDb } = require("../firestore/admin");
    const mockLockRef = {
      get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockDb.collection.mockImplementation((name: string) => {
      if (name === "generationLocks") {
        return { doc: jest.fn(() => mockLockRef) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue({ empty: false, docs: [{ id: "next-plan" }] }),
                })),
              })),
            })),
          })),
        };
      }
      return { doc: jest.fn(() => mockLockRef) };
    });

    const { generateNextWeekPlanService } = require("../services/nextWeekGenerationService");
    await expect(generateNextWeekPlanService("uid-test")).rejects.toThrow(
      "Next week plan already exists."
    );
  });

  it("completes full generation flow when eligible", async () => {
    const { db: mockDb } = require("../firestore/admin");
    const mockLockRef = {
      get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const mockHistorySnap = { empty: true, docs: [] };
    mockDb.collection.mockImplementation((name: string) => {
      if (name === "generationLocks") {
        return { doc: jest.fn(() => mockLockRef) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue(mockHistorySnap),
                })),
              })),
              doc: jest.fn(() => ({
                set: jest.fn().mockResolvedValue(undefined),
              })),
            })),
          })),
        };
      }
      if (name === "workouts") {
        return { doc: jest.fn(() => ({ set: jest.fn().mockResolvedValue(undefined) })) };
      }
      return { doc: jest.fn(() => ({ set: jest.fn().mockResolvedValue(undefined) })) };
    });

    const { generateNextWeekPlanService } = require("../services/nextWeekGenerationService");
    const result = await generateNextWeekPlanService("uid-test");

    expect(result.planId).toBe("new-plan");
    expect(result.weekNumber).toBe(2);
    expect(result.previousPlanId).toBe("current-plan");
    expect(mockLockRef.delete).toHaveBeenCalled();
  });

  it("throws when progression requires manual review", async () => {
    (calculateProgression as jest.Mock).mockReturnValue({
      planId: "new-plan",
      previousPlanId: "current-plan",
      weekNumber: 2,
      adjustments: [],
      safetyFlags: ["flag1", "flag2", "flag3", "flag4"],
      requiresManualReview: true,
    });

    const { db: mockDb } = require("../firestore/admin");
    const mockLockRef = {
      get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const mockHistorySnap = { empty: true, docs: [] };
    mockDb.collection.mockImplementation((name: string) => {
      if (name === "generationLocks") {
        return { doc: jest.fn(() => mockLockRef) };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue(mockHistorySnap),
                })),
              })),
            })),
          })),
        };
      }
      return { doc: jest.fn(() => ({ set: jest.fn().mockResolvedValue(undefined) })) };
    });

    const { generateNextWeekPlanService } = require("../services/nextWeekGenerationService");
    await expect(generateNextWeekPlanService("uid-test")).rejects.toThrow(
      "manual review"
    );
  });
});

describe("nextWeekGenerationService — lock idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not acquire lock when lock already held", async () => {
    const { db: mockDb } = require("../firestore/admin");
    const mockLockRef = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({ timestamp: Date.now(), uid: "uid-test" }),
      }),
      set: jest.fn(),
    };
    mockDb.collection.mockReturnValue({
      doc: jest.fn(() => mockLockRef),
    });

    const { acquireGenerationLock } = require("../services/nextWeekGenerationService");
    const result = await acquireGenerationLock("uid-test");

    expect(result).toBe(false);
    expect(mockLockRef.set).not.toHaveBeenCalled();
  });

  it("acquires lock when previous lock was stale", async () => {
    const { db: mockDb } = require("../firestore/admin");
    const mockLockRef = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({ timestamp: Date.now() - 60000, uid: "uid-test" }),
      }),
      set: jest.fn().mockResolvedValue(undefined),
    };
    mockDb.collection.mockReturnValue({
      doc: jest.fn(() => mockLockRef),
    });

    const { acquireGenerationLock } = require("../services/nextWeekGenerationService");
    const result = await acquireGenerationLock("uid-test");

    expect(result).toBe(true);
    expect(mockLockRef.set).toHaveBeenCalled();
  });
});

function mockLockRef() {
  return {
    get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}
