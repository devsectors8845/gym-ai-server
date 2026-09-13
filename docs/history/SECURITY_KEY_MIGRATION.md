> Historical report, superseded by the current server README. Paths and deployment instructions below describe an earlier architecture.

# AI Credential Security Migration

Status: **code changes complete, key rotation and deploy still required (manual, see below).**
This is a focused follow-up to `GymAI_Workout_Engine_Audit.md` — it covers only the AI-credential exposure fix, nothing else. No workout-generation rules, questionnaire behavior, workout UI, workout history, progression logic, chat UI, exercise selection, or Firestore data structures were touched.

## 1. Where the credentials were found (Step 1 audit)

A full repo search (source tree, `.env`, `android/`, `ios/`, build config, git history) turned up exactly two places an AI credential existed, plus one dead reference:

| Location | Credential | Live/used? |
|---|---|---|
| `.env` (root), line 1 | `OPENAI_API_KEY` | **Not used anywhere in the app.** No file imports it. Exposed for zero functional benefit. |
| `.env` (root), line 2 | `GROQ_API_KEY` | **Live.** Pulled into the client bundle via `react-native-dotenv` (`@env`) and used directly by `src/services/chatService.js` to call `https://api.groq.com/openai/v1/chat/completions` from the React Native app. |
| `src/services/generateWorkoutPlan.js`, line 2 | `import { GROQ_API_KEY } from "../config/keys"` | **Dead code.** `src/config/keys.js` does not exist anywhere on disk or in git history (it's listed in `.gitignore` as a place a key was apparently once meant to live, but was never created/committed), and the imported value was never referenced again in that file. Plan generation does not call any LLM. |

Nothing was found in Android resources (`strings.xml`, `build.gradle`, `google-services.json`, gradle properties), iOS configuration (`Info.plist`, `.pbxproj`, `.xcconfig`), or any build-config file — the exposure was confined to `.env` → the JS bundle via `react-native-dotenv`, plus the one dead import above. `.gitignore` already correctly lists `.env`, `.env.local`, `.env.*`, and `src/config/keys.js`, and `git log --all -S"GROQ_API_KEY"` / `-S"OPENAI_API_KEY"` / `-S"gsk_"` / `-S"sk-proj"` across all branches return **no hits** — `.env` was never committed to this repo's git history. That's good news for this specific repo, but it does **not** change the rotation requirement below: the keys were compiled into every build of the app that anyone installed, which is a bundle-level exposure, not a git-level one, and rotation is about the former.

## 2. What manual key-rotation/revocation steps are still required

**These have not been done yet — they cannot be done from this environment, and no code change substitutes for them.** The actual key values are not reproduced anywhere in this document, in code, or in any log from this task.

1. **Groq key** (the one that was `GROQ_API_KEY` in `.env`): sign in to the [Groq console](https://console.groq.com/keys), revoke that key, and generate a new one. Do **not** reuse the old value anywhere. Set the new value as the `chatWithCoach` Cloud Function's secret (`firebase functions:secrets:set GROQ_API_KEY` — see §5) — never back into `.env` or any client file.
2. **OpenAI key** (the one that was `OPENAI_API_KEY` in `.env`): sign in to the [OpenAI API keys dashboard](https://platform.openai.com/api-keys) and revoke it. Since nothing in the app currently uses OpenAI, there's no functional reason to generate a replacement right now — only create a new one later if/when an OpenAI-backed feature is actually built, and then only store it as a backend secret, never client-side.

Both of these are dashboard actions only a human with account access can take — I have not attempted to fake, script, or work around them.

## 3. Files changed / created

**Modified (existing files):**
- `.env` — both AI keys removed, replaced with an explanatory comment pointing here.
- `src/services/chatService.js` — rewritten to call the new `chatWithCoach` Cloud Function instead of calling Groq directly; no AI key, no `axios` call to Groq, no `@env` import remain in this file. The exported API (`sendMessage`, `clearHistory`, `getHistory`, `getHistoryLength`, default export) is unchanged, so `JimAI.js` (the chat screen) required **no changes** and behaves identically from the user's perspective once the function is deployed.
- `src/services/generateWorkoutPlan.js` — removed the single dead `GROQ_API_KEY` import line (replaced with a comment explaining why). Nothing else in this 2,400+ line file was touched; workout-generation logic is unchanged.
- `package.json` — added one new dependency, `@react-native-firebase/functions` (matching the version already pinned for the sibling `@react-native-firebase/*` packages), needed for the client to call the new Cloud Function. `package-lock.json` was updated accordingly (installed with `npm install --legacy-peer-deps` — see note in §7 about why `--legacy-peer-deps` was needed; this is a pre-existing condition of this project's dependency tree, not something introduced by this change).

**New files (Cloud Functions scaffold — the secure boundary itself):**
- `firebase.json` — points the Firebase CLI at `functions/`. Did not exist before this task; no Cloud Functions had ever been configured for this project.
- `.firebaserc` — binds the CLI to the existing Firebase project (`gymai-e5a14`, matched against `android/app/google-services.json` and the project's own `firebaseConfig.js` to confirm it's the right project).
- `functions/index.js` — the one function, `chatWithCoach`, a direct behavior-preserving server-side port of what `chatService.js` used to do (same model, same request shape, same two user-facing error messages), plus an auth check and basic input-size guarding that didn't exist client-side before.
- `functions/package.json`, `functions/.gitignore` — standard Cloud Functions project files.
- `functions/README.md` — the manual deploy/setup steps (also summarized in §5 below).

**Nothing else was modified.** In particular: no workout-generation rules, questionnaire screens, workout UI, workout history, progression logic, chat UI (`JimAI.js`), exercise selection, or Firestore document shapes were touched by this task.

**Important — pre-existing unrelated changes in your working tree:** before this task started, your local working tree already had substantial uncommitted (and partially staged) changes unrelated to this task — an in-progress rename from `MyApp` to `GymAI`/`gymai` across `android/`/`ios/`, and heavily edited `Home.js`, `Decider.js`, `WorkoutGenerating.js`, `redux/Actions.js`, `redux/Reducers.js`, and other files. I did not create, touch, stage, or commit any of that — `git status`/`git diff` were only used read-only to verify my own change set, and I never ran `git add` or `git commit`. You'll want to review and commit that in-progress work separately from the credential-migration files listed above, so the two don't get mixed into one commit.

## 4. What was removed

- Both AI API key values, from `.env`.
- The only direct, client-side network call to an AI provider (`axios.post` to `api.groq.com` with `Authorization: Bearer ${GROQ_API_KEY}`), from `chatService.js`.
- The dead `GROQ_API_KEY` import from `generateWorkoutPlan.js`.
- After this change, `grep`-ing everything Metro would ever bundle (`src/`, `index.js`, `App.js` — excluding `functions/`, which is a separate Node.js project that is never bundled into the mobile app) for `GROQ_API_KEY`, `OPENAI_API_KEY`, `gsk_`, `sk-proj-`, `api.groq.com`, `api.openai.com`, or any `from '@env'` import returns **zero matches** except inside my own explanatory comments (which name the old variable/pattern for documentation purposes only — they contain no key material and are stripped of meaning by design, e.g. "a dead `GROQ_API_KEY` import used to live here").

## 5. How the new secure architecture works

```
React Native (chatService.js)
    │  functions().httpsCallable('chatWithCoach')({ message, history })
    │  (Firebase Auth ID token attached automatically by the SDK)
    ▼
Firebase Cloud Function "chatWithCoach"  (functions/index.js)
    │  verifies request.auth, validates input, reads GROQ_API_KEY
    │  from a Firebase Functions v2 secret (Secret Manager-backed)
    ▼
Groq API (api.groq.com)
    ▼
Cloud Function → { reply } → React Native
```

The client never sees, stores, or has any code path that could reference the Groq key — it lives only in Google Secret Manager, injected into the function's environment by Firebase at invocation time. This matches the target architecture from the audit (`React Native → Firebase Cloud Function → Groq/OpenAI → Firebase Cloud Function → React Native`).

**This is deliberately the minimum abstraction, not the full backend.** Per the task scope, the workout-generation engine was left completely alone — it doesn't call any AI provider today, so it didn't need a boundary change. Only the chatbot, which was the one feature actually making a direct client-side AI call, was migrated.

**One-time manual setup required before chat works again** (all documented in `functions/README.md`):
1. `firebase login` (interactive — needs a human with project access).
2. Confirm the `gymai-e5a14` Firebase project is on the **Blaze** (pay-as-you-go) plan — Cloud Functions on the free Spark plan cannot make outbound calls to third-party APIs like Groq at all; this is a hard platform requirement, not a setting.
3. `cd functions && npm install` (already done once from this session to validate the code — see §6).
4. `firebase functions:secrets:set GROQ_API_KEY` — paste the **new, rotated** key here, not the old one.
5. `firebase deploy --only functions`.
6. On the client: `npm install` at the project root (already done from this session — adds `@react-native-firebase/functions`), and on iOS, `cd ios && pod install`, then rebuild the native app so the new native module links.

**Until steps 1–5 are done, the chat feature will not work** — `chatWithCoach` isn't deployed yet, so calls to it will fail. That is expected and correct: it's the direct consequence of the app no longer being able to reach Groq on its own, which is the entire point of this change.

**Pre-existing gap noticed, not caused by this change:** no `GoogleService-Info.plist` was found under `ios/`, even though `@react-native-firebase/auth`/`firestore` are already dependencies. If iOS Firebase setup is in fact incomplete, that would affect *any* `@react-native-firebase/*` module on iOS, not just the new `functions` one — worth checking before an iOS build.

## 6. Production-bundle verification results

I attempted to build an actual production JS bundle (`npx react-native bundle --platform android --dev false ...`) twice from this session to grep the real output artifact, per the task's Step 6. **Both attempts were killed by this session's per-command execution ceiling (~110–120s) before Metro finished** — this project's cold bundle (large dependency tree, several multi-megabyte image assets) takes longer than that in this sandboxed environment, and background processes here do not survive past the end of the command that started them, so I could not let it run to completion in the background either. I want to be direct about that limitation rather than claim a bundle-level check I didn't actually complete.

What I *did* verify, directly and completely, as the next-best evidence:
- A full source grep (§4) across every file Metro would ever include in the bundle shows zero AI-key material or Groq/OpenAI network calls remaining.
- `chatService.js`'s only top-level `import` statement is now `@react-native-firebase/functions` — no `axios`, no `@env`.
- `functions/` (where the Groq call now lives) is a separate Node.js project with its own `package.json`, deployed independently to Google's servers — Metro/`react-native bundle` never touches it, so it structurally cannot end up in a mobile build.

Since Metro can only bundle what's statically imported, and nothing importable by the app references an AI key or provider endpoint anymore, a completed bundle would necessarily also be clean — but I'm not asserting that as directly observed. **Recommended follow-up you can run yourself** (should take a few minutes on a normal dev machine, well within reach outside this session's per-command limit):
```
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output /tmp/gymai.android.bundle --assets-dest /tmp/gymai-assets
grep -iE "gsk_|sk-proj-|GROQ_API_KEY|OPENAI_API_KEY|api\.groq\.com|api\.openai\.com" /tmp/gymai.android.bundle
```
Expect no output from the `grep`. (Repeat with `--platform ios` if you want the iOS bundle checked too.)

## 7. Remaining direct Groq/OpenAI calls that must still be moved

**None.** The Groq call in `chatService.js` was the only direct, client-side call to any AI provider anywhere in the app (confirmed in the original audit and re-confirmed here) — it has now been moved behind `chatWithCoach`. There is no OpenAI call anywhere to move (the key was unused). The workout-plan generator does not call any AI provider and was intentionally left untouched, per this task's scope — that remains a separate, future piece of work (see `GymAI_Workout_Engine_Audit.md` §9–§18 for the recommended hybrid architecture for that).

## Note on the `--legacy-peer-deps` flag used during verification

Installing `@react-native-firebase/functions` with a plain `npm install` fails in this project **independent of this change** — `react-native-get-random-values@2.0.0` declares a peer dependency on `react-native@">=0.81"`, while this project pins `react-native@0.79.0`, so npm's strict resolver refuses to proceed on *any* new install until that's reconciled. I used `--legacy-peer-deps` to get past that pre-existing conflict (the same conflict would block installing any other new package right now, not just this one) rather than changing `react-native-get-random-values` or `react-native`'s version, which would be an unrelated change outside this task's scope. Worth flagging to whoever owns dependency upgrades.
