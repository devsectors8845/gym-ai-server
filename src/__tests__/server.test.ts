import request from "supertest";
import type { Express } from "express";

// Mock firebase-admin before any server code loads.
jest.mock("../../functions/src/firestore/admin", () => ({
  db: {
    collection: jest.fn(),
  },
}));

// Mock the user repository so handlers can run without a real Firestore.
jest.mock("../../functions/src/firestore/userRepository", () => ({
  getUserProfile: jest.fn(),
  getCurrentWorkoutPlan: jest.fn(),
  getRecentWorkoutHistory: jest.fn(),
  getRecentExerciseHistory: jest.fn(),
  getExerciseWeightHistory: jest.fn(),
}));

jest.mock("../../functions/src/firestore/workoutRepository", () => ({
  saveGeneratedPlan: jest.fn(),
}));

jest.mock("../../functions/src/firestore/planHistoryRepository", () => ({
  archivePlanVersion: jest.fn(),
  savePlanVersion: jest.fn(),
  getPlanVersion: jest.fn(),
  getCurrentPlanVersion: jest.fn(),
  getPlanVersionsForWeek: jest.fn(),
  listPlanVersions: jest.fn(),
  markPlanCompleted: jest.fn(),
  saveWeekAnalysis: jest.fn(),
  getWeekAnalysis: jest.fn(),
  getLatestWeekAnalysis: jest.fn(),
}));

jest.mock("../../functions/src/services/weekAnalysisService", () => ({
  analyzeWorkoutWeek: jest.fn(),
}));

jest.mock("../../functions/src/services/progressionService", () => ({
  calculateProgression: jest.fn(),
  applyProgressionAdjustments: jest.fn((plan: unknown) => plan),
}));

// Mock the auth middleware so the server doesn't need a real Firebase
// project to test the routing layer. We just simulate that the user is
// already authenticated.
jest.mock("../middleware/auth", () => {
  const actual = jest.requireActual("../middleware/auth");
  return {
    ...actual,
    requireFirebaseAuth: (req: { auth?: { uid: string } }, _res: unknown, next: () => void) => {
      req.auth = { uid: "test-uid" };
      next();
    },
  };
});

import { createApp } from "../index";

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
  fullName: "Test User",
};

const { getUserProfile } = require("../../functions/src/firestore/userRepository");
const { saveGeneratedPlan } = require("../../functions/src/firestore/workoutRepository");

describe("gymai-server — Express app", () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  describe("GET /health", () => {
    it("returns ok without requiring auth", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("gymai-server");
    });
  });

  describe("POST /api/generateWorkoutPlan", () => {
    it("generates, validates, and saves a plan for a valid profile", async () => {
      (getUserProfile as jest.Mock).mockResolvedValueOnce(VALID_PROFILE);
      (saveGeneratedPlan as jest.Mock).mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post("/api/generateWorkoutPlan")
        .set("authorization", "Bearer fake-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.plan).toBeDefined();
      expect(res.body.data.plan.goal).toBe("muscle_gain");
      expect(res.body.data.plan.userProfile.weekly_workouts).toBe(4);
    });

    it("returns failed-precondition when no profile exists", async () => {
      (getUserProfile as jest.Mock).mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post("/api/generateWorkoutPlan")
        .set("authorization", "Bearer fake-token")
        .send({});

      expect(res.status).toBe(412);
      expect(res.body.error.code).toBe("failed-precondition");
      expect(saveGeneratedPlan).not.toHaveBeenCalled();
    });

    it("returns failed-precondition on an unsupported stored goal", async () => {
      (getUserProfile as jest.Mock).mockResolvedValueOnce({
        ...VALID_PROFILE,
        goal: "Get Shredded",
      });

      const res = await request(app)
        .post("/api/generateWorkoutPlan")
        .set("authorization", "Bearer fake-token")
        .send({});

      expect(res.status).toBe(412);
      expect(res.body.error.code).toBe("failed-precondition");
    });
  });

  describe("404 handling", () => {
    it("returns 400 with a clean JSON error for unknown routes", async () => {
      const res = await request(app).post("/api/nonexistent");
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe("invalid-argument");
    });
  });
});
