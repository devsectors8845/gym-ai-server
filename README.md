# GymAI dedicated workout server

Production origin: https://gym-ai-server.vercel.app (provided by the project owner).

## Runtime

`npm ci`, `npm run build`, `npm start`. TypeScript emits the local entry point at `dist/src/index.js`. Vercel bundles `api/index.ts`; `vercel.json` rewrites incoming paths to that function and allows 60 seconds for weekly progression. Source files must not have generated JavaScript siblings: they can shadow the TypeScript and bypass fixes. Build output belongs in `dist` only.

Set `FIREBASE_SERVICE_ACCOUNT` in Vercel to service-account JSON containing `project_id`, `client_email`, and `private_key`. Use the same Firebase project as the mobile app (`gymai-e5a14`). Do not expose the JSON to the app or commit it. Missing Vercel credentials and malformed JSON fail clearly at initialization. Locally, Application Default Credentials/emulators may be used. Every repository and auth verifier shares the default Admin app.

## API

All workout routes require a Firebase ID token in `Authorization: Bearer <token>`. UID is derived from verification, never from the body.

| Method/path | Request | Response data |
| --- | --- | --- |
| GET /health | none | `{ status, service, time }` (not wrapped; liveness only) |
| POST /api/generateWorkoutPlan | `{}` | `{ plan, planId, generatedAt }` |
| POST /api/validateWorkoutPlan | `{ dailyWorkouts: { day: [{ name, bodyPart?, equipment? }] } }` | `{ valid, errors, warnings }` |
| POST /api/checkWeeklyPlan | `{}` | `{ action, plan, planId, weekNumber, message, analysis? }` |

Workout success uses `{ data: result }`; errors use `{ error: { code, message } }`. Codes retain the mobile contract: unauthenticated (401), invalid-argument (400), failed-precondition (412), resource-exhausted (429), internal (500). No general retrieval/update/delete endpoints exist; mobile Firestore access remains intentional.

CORS middleware is absent. Native React Native requests do not require browser CORS. Browser clients on a different origin are not enabled; add an explicit origin policy if a web client is introduced. No scheduled jobs or Firestore triggers are configured. Weekly generation is requested by Home.

## Engine ownership

The code under `functions/src` is retained server-owned engine source, imported by Express. The obsolete workout callable wrappers and Firebase export entry point have been removed. `firebase-functions` remains a server dependency for logging, types, and retained dormant coach/provider code; that code has no HTTP route and is not deployed as a callable. Historical reports are under `docs/history`; they are not current operational instructions.

Generation reads `Users/{uid}` and writes `workouts/{uid}`. Weekly progression also reads history/weights and stores plan versions and week analyses below `users/{uid}`, using `generationLocks`. Existing schema, exercise selection and progression behavior are preserved. The existing generation lock is a read-then-write lock, not transactional; concurrent generation remains a known pre-existing limitation.

## Checks and release

`npm test -- --runInBand` includes HTTP/auth, credential initialization and workout-engine tests. Dormant AI-provider/chat suites are excluded explicitly; those are not released endpoints. Rebuild and redeploy before device validation. A health response alone does not prove credentials or Firestore access work. Sign in on a test account, complete the questionnaire, generate a plan, validate a manual draft, check weekly eligibility, and exercise the existing Firestore reads/edits/deletes.

Vercel configuration reference: https://vercel.com/docs/project-configuration/vercel-json
