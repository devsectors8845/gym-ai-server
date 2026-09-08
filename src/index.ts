import express, { type Express, type Request, type Response } from "express";
import { generateWorkoutPlanRouter } from "./routes/generateWorkoutPlan";
import { validateWorkoutPlanRouter } from "./routes/validateWorkoutPlan";
import { checkWeeklyPlanRouter } from "./routes/checkWeeklyPlan";
import { errorHandler } from "./middleware/errorHandler";
import { HttpError } from "../functions/src/utils/errors";
import "./firebaseAdmin"; // Initialize Firebase Admin SDK on first import

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
export function createApp(): Express {
  const app = express();

  // JSON body parser. Cloud Functions' onCall wrapped the body in
  // `{ data: ... }`; our adapter expects the raw `data` shape, so the
  // client sends `{ data: { ... } }` and we unwrap it here.
  app.use(express.json({ limit: "1mb" }));

  // Liveness probe — useful for Vercel + uptime monitors. Does not touch
  // Firestore, so it stays fast and side-effect-free.
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "gymai-server", time: new Date().toISOString() });
  });

  // Workout routes — same names as the original Cloud Functions so the
  // client swap is a URL change, not a contract change.
  app.use("/api/generateWorkoutPlan", generateWorkoutPlanRouter);
  app.use("/api/validateWorkoutPlan", validateWorkoutPlanRouter);
  app.use("/api/checkWeeklyPlan", checkWeeklyPlanRouter);

  // 404 for unknown routes. We keep this generic so unauthenticated users
  // probing for `/api/chatWithCoach` don't get a more informative error
  // than any other 404.
  app.use((_req: Request, _res: Response, next) => {
    next(new HttpError("invalid-argument", "Not found."));
  });

  // Last middleware: maps everything to a clean JSON error response.
  // Must be registered after all routes.
  app.use(errorHandler);

  return app;
}

// Vercel deploys one serverless function per file under `/api`. We export
// the app as the default export so Vercel's `@vercel/node` runtime can wrap
// every incoming request in Express. The same export also works for any
// long-running Node host (Render, Fly, Railway, plain `node index.js`).
const app = createApp();
export default app;

// Local development: `npm run start` runs the server on the port from
// `process.env.PORT` (default 3000). Vercel ignores this branch entirely.
if (process.env.NODE_ENV !== "production" && require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[gymai-server] listening on http://localhost:${port}`);
  });
}
