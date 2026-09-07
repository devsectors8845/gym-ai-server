"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateWorkoutPlanRouter = void 0;
const express_1 = require("express");
const validateWorkoutPlan_1 = require("../../../functions/src/functions/validateWorkoutPlan");
const auth_1 = require("../middleware/auth");
const adapter_1 = require("../middleware/adapter");
/**
 * POST /api/validateWorkoutPlan
 *
 * Validates a manually-built plan against the user's equipment and
 * limitation rules before the client persists it. Best-effort catalog
 * matching by exercise name.
 *
 * Body shape: `{ dailyWorkouts: Record<string, { name: string, bodyPart?: string, equipment?: string }[]> }`
 */
exports.validateWorkoutPlanRouter = (0, express_1.Router)();
exports.validateWorkoutPlanRouter.post("/", auth_1.requireFirebaseAuth, (0, adapter_1.adaptHandler)(validateWorkoutPlan_1.validateWorkoutPlanHandler));
//# sourceMappingURL=validateWorkoutPlan.js.map