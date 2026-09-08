"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkWeeklyPlanRouter = void 0;
const express_1 = require("express");
const generateNextWeekPlan_1 = require("../../functions/src/functions/generateNextWeekPlan");
const auth_1 = require("../middleware/auth");
const adapter_1 = require("../middleware/adapter");
/**
 * POST /api/checkWeeklyPlan
 *
 * Two-in-one endpoint that mirrors the original `checkWeeklyPlan` Cloud
 * Function's behavior:
 *   - "eligible"  -> analyzes the past week, builds the next-week plan
 *                    (Week 2+ progression), saves to Firestore, returns
 *                    `{ action: "generated", plan, planId, weekNumber, ... }`
 *   - "up_to_date" / "not_ready" -> returns a status payload; the client
 *                    decides whether to show "come back later" or similar.
 *
 * Auth required. Idempotent: a lock doc prevents concurrent generation.
 */
exports.checkWeeklyPlanRouter = (0, express_1.Router)();
exports.checkWeeklyPlanRouter.post("/", auth_1.requireFirebaseAuth, (0, adapter_1.adaptHandler)(generateNextWeekPlan_1.checkWeeklyPlanHandler));
//# sourceMappingURL=checkWeeklyPlan.js.map