# GymAI backend migration report

Status: local migration complete; production deployment and authenticated end-to-end verification outstanding. No deployment, remote function deletion, live database writes, or git commit was performed.

## 1. Old architecture and audit

Both repositories were clean before changes. Traced the mobile API services, Firebase imports, navigation/screens, Firestore reads/writes, all backend routes, callable exports, scheduling/trigger declarations, manifests, environment-variable names and deployment configuration. Compared the two engine source trees: business logic matched; repository differences were Admin initialization and added TypeScript annotations. Documentation was treated as historical evidence, not as instructions to deploy or delete.

The mobile app already used an HTTP client for generation, manual validation and weekly progression. Its default hostname was wrong: `gymai-server.vercel.app` returned DEPLOYMENT_NOT_FOUND. The app also relied on an Expo public environment override despite using plain React Native/Metro without Expo injection.

The embedded Express server exposed only those three workout routes plus a health probe. The local Firebase entry point exported generation, validation and weekly eligibility/generation. No scheduled tasks, Firestore triggers or Auth triggers were found. Home invokes weekly progression during app use. Dormant chat/provider code was not exported by the entry point and had no caller or navigation route; a copy remains in the dedicated server.

## 2. New architecture

Mobile config bundles the owner-confirmed production origin `https://gym-ai-server.vercel.app`. Firebase Auth supplies the ID token. The HTTP client sends raw JSON and a Bearer token; Express verifies the token, derives the UID, then runs the server-owned engine. UI and navigation are unchanged.

| Operation | Transport and ownership |
| --- | --- |
| Initial generation | POST `/api/generateWorkoutPlan`, `{}`; server reads `Users/{uid}`, builds/validates and saves `workouts/{uid}` |
| Manual validation | POST `/api/validateWorkoutPlan`, `{ dailyWorkouts }`; returns valid/errors/warnings; existing client save and network-failure behavior retained |
| Weekly progression | POST `/api/checkWeeklyPlan`, `{}`; server checks eligibility, history and progression and saves the next plan |
| Profile, current-plan retrieval/edits, history and custom sessions | Existing native Firestore calls remain; dedicated server has no general CRUD replacement |

Workout success responses wrap results in `{ data }`; failures use `{ error: { code, message } }`. Existing `functions/` error-code prefixes in the mobile adapter are compatibility strings, not Firebase callable invocations. Requests time out after 65 seconds and reject malformed responses. Firebase handles expired-token refresh automatically.

Firestore collection casing and schema were preserved: `Users`, `workouts`, `users/{uid}/workoutHistory`, `exerciseHistory`, `exerciseWeights`, `planHistory`, `weekAnalysis`, custom workout sessions and generation locks. Server repositories now share one credential-aware Firebase Admin initialization; they can no longer initialize the default app without credentials before the HTTP entry point loads.

## 3. Removed

- Mobile `server/` tree: duplicate routes, middleware, build/test configuration and dependencies.
- Mobile `functions/` tree: three replaced workout callables and duplicate engine/test/provider copies. All required engine source/tests and dormant provider code remain in the dedicated repository.
- Mobile Firebase Functions deployment configuration and Functions emulator entry. Auth/Firestore emulator configuration remains.
- Unused web Firebase bootstrap `firebaseConfig.js`; no imports referenced it. Native Firebase initialization remains.
- Mobile `@react-native-firebase/functions` dependency and both lockfile entries. Stale dotenv/react-native-dotenv lock entries were also pruned; they were already absent from package.json and Babel configuration.
- Dedicated server: obsolete workout callable wrappers, unused Firebase export entry point, and generated `.js`/`.js.map` siblings of TypeScript source. Build output stays in `dist`.

Removed source was backed up before application at:
`/Users/laptoparena/.codex/.chatgpt-projects/g-p-6a9b58ea73cc8191a37a4a277b075b7d/migration-work/before-migration-20260912-000340.tar.gz`
The backup excludes dependency/build directories and git metadata. Remote deployed Firebase functions were not deleted; deployed inventory and usage by older released clients were not available to verify.

## 4. Kept

Native Firebase App, Auth and Firestore: signup/login/password reset, profile questionnaires, plan persistence, workout history, weights, statistics and custom sessions still use them. Native Android/iOS Firebase configuration was untouched.

Axios, ExerciseDB browsing and the local exercise catalog remain required by AddExercise. Cloudinary profile uploads remain. The large local exercise-generator class was retained because browsing shares that service; public plan generation uses HTTP only. No UI behavior was changed.

Dedicated-server `firebase-functions` remains needed for logging, callable request types and retained dormant coach/provider source; it is not a mobile dependency. Browser CORS is not configured; native mobile requests do not use browser CORS enforcement. No additional browser client was introduced.

## 5. Modified files

Mobile: `src/config/workoutApi.js`, `src/services/workoutApi.js`, comments in `src/services/generateWorkoutPlan.js` and the WorkoutGenerating/ManualWorkout screens, `package.json`, `package-lock.json`, `yarn.lock`, `firebase.json`, README and four older architecture reports; added `__tests__/workoutApi.test.js` and this report. Historical reports were preserved in the server's `docs/history` with explicit historical labels.

Server: `src/firebaseAdmin.ts`, `functions/src/firestore/admin.ts`, three workout handlers, error middleware, API body comment, package start/main paths, Vercel configuration, TypeScript/Jest configuration, validation test error type, HTTP tests; added credential tests, `.env.example`, README and historical documentation. Production service-account values were not read or changed. Required variable is `FIREBASE_SERVICE_ACCOUNT` for the same Firebase project as the mobile app.

Vercel now targets the source `api/index.ts` entry with a 60-second allowance, rather than a generated file outside the API source directory. The compiled local startup path is `dist/src/index.js`. Source reference: https://vercel.com/docs/project-configuration/vercel-json

## 6. Verification and remaining work

| Check | Result |
| --- | --- |
| Server TypeScript build | Passed |
| Compiled Express module import | Passed |
| Server tests | 14 suites, 149 tests passed, covering HTTP/auth, credential initialization, generation, manual validation, weekly progression and engine rules |
| Mobile API contract tests | 11 passed: production routes, token header, raw body, signed-out behavior, errors, malformed responses, network failure and timeout |
| Full mobile test run | 1 suite passed, 1 failed: pre-existing App render test cannot parse React Navigation ESM; same failure occurred before migration |
| Mobile TypeScript check | Passed; current TypeScript configuration is not a complete check of the JavaScript app |
| Mobile lint | Existing script fails because the checkout has no ESLint configuration; not a migration regression |
| Dependency references | No native Firebase Functions package remains in package.json/npm/yarn locks; transitive web Firebase internals remain part of other dependencies |
| Relative imports and removed endpoint/config references | Checked; runtime has no old backend URL, callable invocation or deleted backend import. Compatibility error-code strings are intentionally retained |
| Production health, 2026-09-13 | HTTP 500, Vercel FUNCTION_INVOCATION_FAILED; the earlier incorrect hostname returned DEPLOYMENT_NOT_FOUND |

The original server tests passed 8 checks but resolved stale JavaScript and skipped engine tests. The new setup exercises TypeScript directly and includes engine suites. Dormant chat/provider tests remain explicitly outside the released workout test suite.

The dependency refresh encountered existing peer conflicts (including react-native-get-random-values requiring a newer React Native); lock cleanup preserves existing versions rather than upgrading unrelated packages.

Release steps: deploy the changed dedicated server, confirm Vercel has valid service-account JSON for `gymai-e5a14`, check deployment logs and `/health`, then rebuild the native app (refresh CocoaPods when applicable). Use a signed-in test account to verify real token acceptance, questionnaire persistence, generated-plan writes, manual validation/save, current-plan reads/edits, history updates/deletes and weekly eligibility/progression. No live account/token was available, so those operations and deployed Firestore rules/indexes were not verified. A healthy response alone will not prove Firestore connectivity.

Pre-existing behavior retained: manual validation allows saving after network failure; weekly generation uses a non-transactional read-then-write lock, so concurrent requests remain a limitation. These were not broadened into unrelated behavioral changes.
