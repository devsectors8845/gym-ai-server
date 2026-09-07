"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWorkoutPlanRouter = void 0;
const express_1 = require("express");
const generateWorkoutPlan_1 = require("../../../functions/src/functions/generateWorkoutPlan");
const auth_1 = require("../middleware/auth");
const adapter_1 = require("../middleware/adapter");
/**
 * POST /api/generateWorkoutPlan
 *
 * Generates the user's first weekly workout plan from their questionnaire
 * profile (read server-side from Firestore). No client input — the same
 * contract as the original Cloud Function. Auth required.
 */
exports.generateWorkoutPlanRouter = (0, express_1.Router)();
exports.generateWorkoutPlanRouter.post("/", auth_1.requireFirebaseAuth, (0, adapter_1.adaptHandler)(generateWorkoutPlan_1.generateWorkoutPlanHandler));
//# sourceMappingURL=generateWorkoutPlan.js.map