"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const generateWorkoutPlan_1 = require("./routes/generateWorkoutPlan");
const validateWorkoutPlan_1 = require("./routes/validateWorkoutPlan");
const checkWeeklyPlan_1 = require("./routes/checkWeeklyPlan");
const errorHandler_1 = require("./middleware/errorHandler");
const errors_1 = require("../../functions/src/utils/errors");
require("./firebaseAdmin"); // Initialize Firebase Admin SDK on first import
/**
 * Builds the Express app. Exported as a function (rather than a top-level
 * const) so tests can construct fresh, isolated app instances.
 *
 * Route map (all POST, all require `Authorization: Bearer <Firebase ID token>`):
 *   POST /api/generateWorkoutPlan   -> generates Week 1 plan from profile
 *   POST /api/validateWorkoutPlan   -> validates a manual workout
 *   POST /api/checkWeeklyPlan       -> Week 2+ eligibility + generation
 *   GET  /health                    -> liveness probe (no auth, no Firestore)
 */
function createApp() {
    const app = (0, express_1.default)();
    // JSON body parser. Cloud Functions' onCall wrapped the body in
    // `{ data: ... }`; our adapter expects the raw `data` shape, so the
    // client sends `{ data: { ... } }` and we unwrap it here.
    app.use(express_1.default.json({ limit: "1mb" }));
    // Liveness probe — useful for Vercel + uptime monitors. Does not touch
    // Firestore, so it stays fast and side-effect-free.
    app.get("/health", (_req, res) => {
        res.status(200).json({ status: "ok", service: "gymai-server", time: new Date().toISOString() });
    });
    // Workout routes — same names as the original Cloud Functions so the
    // client swap is a URL change, not a contract change.
    app.use("/api/generateWorkoutPlan", generateWorkoutPlan_1.generateWorkoutPlanRouter);
    app.use("/api/validateWorkoutPlan", validateWorkoutPlan_1.validateWorkoutPlanRouter);
    app.use("/api/checkWeeklyPlan", checkWeeklyPlan_1.checkWeeklyPlanRouter);
    // 404 for unknown routes. We keep this generic so unauthenticated users
    // probing for `/api/chatWithCoach` don't get a more informative error
    // than any other 404.
    app.use((_req, _res, next) => {
        next(new errors_1.HttpError("invalid-argument", "Not found."));
    });
    // Last middleware: maps everything to a clean JSON error response.
    // Must be registered after all routes.
    app.use(errorHandler_1.errorHandler);
    return app;
}
// Vercel deploys one serverless function per file under `/api`. We export
// the app as the default export so Vercel's `@vercel/node` runtime can wrap
// every incoming request in Express. The same export also works for any
// long-running Node host (Render, Fly, Railway, plain `node index.js`).
const app = createApp();
exports.default = app;
// Local development: `npm run start` runs the server on the port from
// `process.env.PORT` (default 3000). Vercel ignores this branch entirely.
if (process.env.NODE_ENV !== "production" && require.main === module) {
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`[gymai-server] listening on http://localhost:${port}`);
    });
}
//# sourceMappingURL=index.js.map