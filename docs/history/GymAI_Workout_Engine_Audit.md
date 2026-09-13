> Historical report, superseded by the current server README. Paths and deployment instructions below describe an earlier architecture.

# GymAI — Workout Plan Generation & AI Chatbot Audit

**Scope:** React Native app (`gymai`), Firebase backend, questionnaire → plan generation → workout tracking → weekly regeneration → AI chatbot.
**Method:** Full read of the questionnaire flow, navigation, state management, `generateWorkoutPlan.js`, `firebaseWorkoutHistory.js`, `chatService.js`, all main workout screens, and the exercise-builder screens, plus a repo-wide grep for AI/backend/scheduling patterns. No code was changed.
**Bottom line up front:** the app has no backend — it is a pure React Native client talking directly to Firestore, a public ExerciseDB mirror, and Groq's chat API, with both a Groq and an (unused) OpenAI key bundled into the client. Plan generation is 100% rule-based (not LLM-based, despite the app's name), largely ignores the questionnaire data it collects, and never looks at a user's workout history. The chatbot is a stock LLM call with no knowledge of the user, their plan, or their history. Neither "week 2 is generated from week 1" nor "the AI is grounded in the user's actual plan" is true today.

---

## 1. Current Architecture Summary

- **Client:** React Native 0.79 / React 19, React Navigation (native-stack + bottom-tabs), Redux (`redux`/`react-redux`, but only used for a single `workoutPlan` + `loading` slice), a custom `UserContext` (React Context) for the user profile, and `AsyncStorage` used only to remember the logged-in user's email.
- **No backend.** There is no `functions/` directory, no Node/Express service, no cron/scheduler of any kind (confirmed by a repo-wide grep — the only "schedule" hits are UI copy strings and npm's internal `scheduler` package). Every screen talks **directly** to Firebase Firestore/Auth via the `@react-native-firebase/*` SDKs.
- **Data store:** Cloud Firestore. Key collections found:
  - `Users/{autoId}` — profile/questionnaire data, queried by email (not by `uid`) in `UserContext`.
  - `workouts/{uid}` — the current week's plan (`weekStart`, `nextPlanDue`, `plan`, `createdAt`, `source`), one document per user, overwritten on every (re)generation.
  - `users/{uid}/workoutHistory/{autoId}`, `users/{uid}/exerciseHistory/{autoId}`, `users/{uid}/exerciseWeights/{exerciseId}` — completion/PR history, written by `firebaseWorkoutHistory.js` (`WorkoutHistoryService`).
- **External services called directly from the client, with keys shipped in the app bundle:**
  - `https://exercisedb-api.vercel.app/api/v1` — a public, unauthenticated third-party exercise database mirror, called via `axios` from `generateWorkoutPlan.js`.
  - `https://api.groq.com/openai/v1/chat/completions` — the chatbot, model `llama-3.1-8b-instant`, called via `axios` from `chatService.js` using `GROQ_API_KEY` pulled from `.env` via `react-native-dotenv` (`@env`).
  - An `OPENAI_API_KEY` also sits in `.env` but is **never referenced by any file in the app** — it's dead, unused, and exposed for no functional benefit.
- **State management:** no React Query, no SWR, no caching layer of any kind, despite that being the team's normal stack. Each screen does its own `firestore()` calls with local `useState`/`useEffect` for loading/error handling — inconsistent in rigor across screens.
- **Testing:** a single boilerplate `App.test.tsx`; no unit tests over the plan generator, history service, or chatbot.

## 2. Current Workout-Generation Flow

`Questionnaire → Firestore("Users") → UserContext → WorkoutGenerating screen → generateExerciseDBWorkoutPlan(userData) → Firestore("workouts/{uid}").set() → Home/Myplan UI`

- **Trigger:** `WorkoutGenerating.js`, on mount, calls `generateExerciseDBWorkoutPlan(userData)` where `userData` comes straight from `UserContext` (i.e., whatever was last written to the `Users` collection).
- **Generator (`src/services/generateWorkoutPlan.js`, ~2,450 lines, class `ExerciseDBWorkoutGenerator`):** entirely **rule-based/deterministic** (plus one randomized step). It is **not** an LLM call — there is no OpenAI/Groq/Gemini call anywhere in this file. "ExerciseDB" refers to a live third-party REST API (`exercisedb-api.vercel.app`) with a ~33-exercise hardcoded local array as a fallback when the API is unavailable.
- **Algorithm:** normalize `goal` and `gymExperience` → pick a static split template (Push/Pull/Legs-style, one of 5 goal-specific tables) sized to `weeklyWorkoutCommitment` → for each day, map the day-type label to muscle groups via keyword matching → pull exercises for each muscle group from the API (or local fallback), filtered by a coarse `availableEquipment` match, filtered again for "beginner-unsafe" keywords only if `gymExperience` is beginner → randomly pick a fixed count per muscle group (Fisher–Yates shuffle) → attach **identical, hardcoded sets/reps/rest values for every exercise on the day**, keyed only by `goal × experience level`.
- **Fields collected by the questionnaire but never read by the generator (confirmed by grep — zero matches):** `currentDiet`, `currentPhysique`, `dietaryPreferences`, `energyLevel`, `fitnessChallenge`, `foodAllergies`, `goalPhysique`, `sleepHours`, `waterIntakeLiters`, and the free-text `modifications` field (injuries/limitations). `age` and `gender` are copied into the plan's display header only, never used to change exercise selection or volume.
- **Validation before saving:** only checks the plan isn't structurally empty (`totalExercises > 0`). No check on individual exercises, no duplicate-across-week check, no equipment re-verification, no sets/reps sanity check.
- **Storage:** `firestore().collection("workouts").doc(uid).set({...})` — a full overwrite, not a merge, and not preceded by a read of the existing document.
- **Display:** Home.js computes "today" as `(daysSinceWeekStart) % weekly_split.length` and renders that day's exercises; Myplan.js shows all 7 days from the Redux-cached plan.
- **On failure:** the screen shows a typed error UI (`network`, `validation`, `generation`, `unknown`) with a retry button and a "create manually" escape hatch (`ManualWorkout.js`) — reasonable UX, but two of the four error branches (`TIMEOUT`, `NETWORK_ERROR`) are **dead code**, because the generator swallows all network failures internally and silently falls back to the local exercise list rather than throwing.
- **Is it actually personalized?** Only weakly. It reliably differentiates by **goal, experience level, equipment, and days/week** — but `normalizeGoal()` does an *exact* string match against only 8 hardcoded phrases, while the questionnaire offers 8 different goal options (`Strength Training, Powerlifting, Health, Weight Loss, Muscle Gain, Body Recomposition, General Fitness, Athletic Performance`). Only `Muscle Gain` and `Weight Loss` match; the other **six options silently fall back to the generic "Build Muscle" template** with no error or log. Combined with the ignored fields above, most users are getting a materially less personalized plan than the questionnaire implies.

## 3. Current Weekly-Update Flow

- **Detection exists, automation does not.** `Home.js` has a `checkPlanExpiry()` effect that compares `nextPlanDue` (set at generation time to `weekStart + 7 days`) to `now` and sets a `planExpired` flag. When true, it shows a full-screen "Your Plan Has Ended" overlay with a button.
- **That button just re-runs first-time generation.** Pressing it (or the always-visible "Regenerate Plan" CTA) navigates to `WorkoutGenerating` with `{ regenerate: true }`, which calls the **exact same** `generateExerciseDBWorkoutPlan(userData)` used for week 1. There is no `generateNextWeek(userData, previousWeekHistory)` path — the file exports only one generation function, and it has no concept of "which week number" it's building.
- **No history is read.** `WorkoutGenerating.js` never imports or calls `WorkoutHistoryService`. Regeneration is a pure function of the (mostly-ignored) profile snapshot plus fresh randomization — completed workouts, missed workouts, PRs, and feedback have zero influence on the new week.
- **Regeneration destroys data.** Because the write is `.set()` (not `merge: true`), and `PullPushDay.js` separately stores `plan.completed_workouts.{day}` on that same `workouts/{uid}` document, regenerating a plan **wipes any in-progress completion tracking for the week that was just replaced**, with no read-before-write reconciliation.
- **No automatic trigger.** There is no scheduled job (none exists — no backend), and nothing runs regeneration proactively. If the user doesn't open Home.js and doesn't notice/press the button, the plan just sits expired indefinitely, while the day-index math (`daysSinceWeekStart % split.length`) keeps silently cycling through the *same* stale week's content as if it were current — the "expired" banner and "what to show today" logic are computed independently and can visibly disagree.
- **Concurrency:** no lock, no transaction, no idempotency token on generation. Two near-simultaneous regenerate calls (double-tap, two devices) both write; last write wins non-deterministically.

## 4. Current Chatbot Flow

- **Model/API:** Groq's OpenAI-compatible endpoint, model `llama-3.1-8b-instant`, called directly from the RN app (`src/services/chatService.js`) with the API key embedded in the client via `@env`. (Note: this file's internal header comment still calls itself `groqService.js` — a rename that wasn't fully cleaned up.)
- **Prompt construction:** none, in the "system prompt" sense. The request body is just the last 10 turns of an **in-memory, module-level** `conversationHistory` array plus the user's new raw message — no system role, no persona, no safety instructions, no user data.
- **User context available to the model:** **zero.** `JimAI.js` (the chat screen) passes only the raw typed string to `chatService.sendMessage()`. There is no `UserContext`, Redux, or Firestore read anywhere in the chat path. The model has no way to know the user's name, goal, equipment, current plan, or history.
- **Persistence:** none. History lives only in a JS variable for the life of the app process — a full app restart wipes it, and even within one session the chat screen's own visible message list resets to a single greeting bubble on remount (a UI/data desync, since the underlying service-level history would still be intact in memory but isn't reloaded into the UI).
- **Concrete consequence:** if a user asks *"why did you give me squats today?"* or *"I couldn't complete 3 sets yesterday, what should I do?"*, the model has no plan and no history to reference — any answer that sounds specific to "your plan" is fabricated, not grounded. There is no RAG, no function-calling, no tool access to Firestore.
- **Safety/hallucination handling:** none — no system-level guardrails for medical/injury questions, no disclaimer logic, no token-usage cap beyond the 10-turn history trim and a flat `max_tokens: 1024`.
- **Error handling:** basic — rate-limit (429) and generic network errors are caught and shown as canned chat bubbles; reasonable as far as it goes, but errors are folded into the chat transcript rather than a distinct UI state.

## 5–8. Problems Found

### Critical (fix before doing anything else)

1. **Live API keys shipped in the client bundle.** `.env` contains a real OpenAI key and a real Groq key, pulled into the JS bundle at build time via `react-native-dotenv`. Both are trivially extractable from any built APK/IPA (string literals in a JS bundle are not meaningfully obfuscated). **Rotate both keys immediately and treat them as already compromised** — this is true independent of anything else in this report, and independent of whether OpenAI is even used (it currently isn't, which makes that key pure unnecessary exposure).
2. **The chatbot cannot answer questions about the user's own plan.** No profile, plan, or history is ever injected — every "personalized" answer it appears to give is coincidental, not grounded.
3. **Plan generation ignores most of the data the questionnaire collects.** `currentDiet`, `currentPhysique`, `dietaryPreferences`, `energyLevel`, `fitnessChallenge`, `foodAllergies`, `goalPhysique`, `sleepHours`, `waterIntakeLiters`, `age`, `gender`, and the injury/limitation free-text field (`modifications`) are all collected and all unused by the generator. There is **no injury-awareness at all** — nothing prevents an exercise being assigned that the user explicitly flagged as unsafe for them.
4. **`normalizeGoal()` silently mis-routes 6 of 8 goal options** to a generic "Build Muscle" template via exact (not fuzzy) string matching, with no error or log — most users' stated goal is quietly ignored.
5. **Week-to-week continuity does not exist.** Plan generation never reads prior completion, performance, or feedback data; regenerating a plan is functionally identical whether the user completed 100% or 0% of the prior week. This directly contradicts the desired "Week 2 built from Week 1" behavior.
6. **Regeneration destroys the current week's completion record** (`.set()` instead of a merge/transaction), because completion data (`plan.completed_workouts`) and the plan document share one Firestore doc with no reconciliation.
7. **Two disconnected "finish workout" write paths.** Finishing via `PullPushDay.js` writes only a raw `plan.completed_workouts.{day}` flag and never calls `WorkoutHistoryService` — so workouts finished that way never appear in workout history, streaks, PR tracking, or the Statistics screen. Finishing via `StartFullWorkoutScreen.js` does call the history service correctly. Depending on which button a user happens to tap, their data either exists or silently doesn't.
8. **No automatic weekly regeneration.** There is no backend, so there is no scheduled job. The entire "auto-generate next week" requirement in the product spec does not exist today — it's a manual button gated behind the user opening the Home screen and noticing an overlay with no reminder mechanism.
9. **`EditRoutine.js` will crash** (`TypeError: Cannot read properties of undefined`) the moment a user taps "Edit" on any exercise, because it reads `exercise.sets`/`exercise.reps` directly while every real exercise object nests those fields under `exercise.workoutDetails.{sets,reps}`.
10. **No concurrency control** on plan generation or completion writes — no transactions, no in-progress lock server-side (only a client-side `isGenerating` flag that doesn't survive across devices/tabs).

### Medium

- Equipment vocabulary is duplicated and inconsistent across four independent places (onboarding options, the generator's matcher, `AddExercise.js`'s fallback list, `ManualWorkout.js`'s inline list). This has already produced a live bug: the onboarding option **"Dumbells"** (missing a "b") never matches the generator's `"dumbbell"` substring check, so users who select it never get dumbbell exercises from the filter. `"Squat rack"`, `"Back extension"`, and `"Pull up/Dip bars"` also match nothing and are silently dropped.
- **No way to edit goal, equipment, experience, or frequency after onboarding.** `EditProfile.js` only edits name/contact/weight/height. The profile that drives generation is frozen forever after the first questionnaire pass, even though "Regenerate Plan" implies it should reflect current circumstances.
- **Statistics screen shows fabricated placeholder data** as if it were real whenever the stats fetch fails or returns null, with no visual indication it's a fallback — a user could believe they have real muscle-group history that doesn't exist.
- No exercise-level validation anywhere (equipment mismatch, malformed IDs, duplicate-across-week, volume sanity) despite this being explicitly wanted.
- Chat history is fully ephemeral and desynced from the visible UI on remount (see §4).
- Full questionnaire object (name, age, height, weight, goals, etc.) is logged unconditionally via `console.log` in `WorkoutGenerating.js`.
- No error boundary anywhere in the app — a render-time exception on a malformed plan object would white-screen rather than degrade gracefully.
- `FormTipsLibraryScreen.js`'s "form tips" are identical boilerplate sentences for every exercise (template-interpolated, not exercise-specific), despite the screen's name implying curated content.
- No React Query (or any caching/retry layer) anywhere, despite it being the team's normal stack — every screen hand-rolls loading/error state with varying rigor.
- The generator's only external exercise source is an unauthenticated, unofficial public mirror (`exercisedb-api.vercel.app`) with no SLA — a single point of failure with no visibility into uptime or licensing terms.
- Dead code: unreachable "Clear Chat History" button in `JimAI.js`, unreachable delete-confirmation modal in `PullPushDay.js`, a `GROQ_API_KEY` import in `generateWorkoutPlan.js` from a `../config/keys` file that doesn't exist in the repo (and is never used even if it resolved).

### Nice-to-have

- Progressive-overload and deload-week logic.
- Richer exercise metadata: difficulty, movement pattern, contraindications, substitution graph (see §12).
- Push notifications / reminders when a plan expires or is close to expiring.
- One canonical exercise catalog shared by the generator, the manual builder, and the exercise-add screens (currently four independent lists).
- Dedicated, structured RPE/pain-input UI on workout completion.
- Consolidate the ad hoc `Colors`/`Fonts` objects redefined locally in several screens (e.g., `WorkoutGenerating.js` redeclares its own theme constants instead of importing `constants/theme.js`).

## 9. Recommended New Architecture (Hybrid, Not "Ask an LLM for a Plan")

Keep a **deterministic programming engine as the source of truth**, and use AI only where judgment/language is genuinely needed — never for arithmetic or safety-critical decisions.

```
React Native (no API keys, no direct 3rd-party calls)
        │  (Firebase Auth ID token)
        ▼
Firebase Cloud Functions (callable + scheduled)
        │
        ├─ Deterministic Programming Engine (ported/hardened version of today's
        │  generateWorkoutPlan.js logic — exercise selection, split templates,
        │  volume/sets/reps rules, equipment & injury filtering, progression rules)
        │      │
        │      ├─ reads: user profile (Firestore), workout history & PRs (Firestore)
        │      └─ produces: a *valid-by-construction* candidate plan
        │
        ├─ AI Personalization Layer (Gemini/Groq call, server-side only)
        │      • rewrites free-text goal/limitation notes into structured tags
        │        the engine consumes
        │      • picks among engine-approved exercise candidates for variety
        │        and stated preferences
        │      • writes human-readable weekly rationale/coaching notes
        │      • proposes progression deltas (e.g. "+2.5kg on bench") for the
        │        engine to validate, never authors raw sets/reps/rest itself
        │
        ├─ Validation Layer (schema + business rules, §14) — runs on
        │  BOTH the deterministic output and any AI-touched output before
        │  anything is written to Firestore
        │
        └─ Chatbot orchestrator — injects a compact structured summary of
           profile + current plan + recent history into the model, exposes
           controlled "actions" (e.g. request-substitution) instead of
           direct database access
        │
        ▼
Firestore (source of truth) → React Native reads via React Query
```

**What stays code/rules (never delegate to an LLM):** exercise database & metadata, equipment/injury filtering, sets/reps/rest/volume tables, weekly split templates, muscle-group balance, duplicate/overtraining checks, progression math, and all final validation. **What AI is good for:** interpreting free text, choosing among already-safe options for variety/preference, writing explanations, and powering the chatbot's language — always downstream of the engine, always re-validated before being trusted.

## 10. Recommended AI Model/API

The app already has a working, low-latency integration with **Groq** (`llama-3.1-8b-instant`) for chat — keep that for the chatbot's conversational turns (fast, already proven in this codebase), but consider `llama-3.3-70b-versatile` for noticeably better reasoning quality on plan-related questions, and move the call server-side.

For the new structured-JSON work (goal/preference interpretation, weekly rationale generation, AI-assisted validation), add **Google's Gemini API**. As of the current official pricing page (checked live for this audit), **Gemini 2.5 Flash and Gemini 2.5 Flash-Lite both show "Free of charge" input and output tokens on the free tier**, with strong native JSON-schema/structured-output support and generous context for injecting a user's history — a good fit for this workload. Gemini 2.0 Flash is no longer listed on the current pricing page, so don't plan around it. Google does **not** publish exact free-tier RPM/RPD/TPM figures on the pricing page itself — check the live numbers in Google AI Studio's rate-limit page at implementation time, since these change over time and are usage-tier dependent; don't hardcode assumed figures into capacity planning.

**Recommendation for now (dev/testing):** Gemini 2.5 Flash-Lite for structured plan-personalization/validation calls (cheapest, JSON-native, currently free), Groq (existing key, now moved server-side) for the conversational chatbot. **Never call either from the React Native app directly** — always via the Cloud Functions broker in §9, so no key ever ships in a client bundle again. Self-hosted/open-source models (e.g., via a hosted inference endpoint) are worth revisiting once usage justifies the ops cost, but add real infrastructure burden the current one-person/small-team setup doesn't need yet.

*Sources: [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Groq Rate Limits](https://console.groq.com/docs/rate-limits).*

## 11. Recommended Prompt Strategy

Never send a large freeform paragraph. Send a small, structured JSON object and demand strict structured JSON back (Gemini's `responseSchema`/JSON mode, or Groq's JSON mode where available):

```json
// INPUT to the AI personalization step (not the whole plan — just the parts needing judgment)
{
  "goal": "Athletic Performance",
  "experience": "intermediate",
  "freeTextNotes": "bad left knee, avoid deep squats",
  "candidateExercisesByMuscleGroup": {
    "quadriceps": [{"id": "ex_112", "name": "Leg Press"}, {"id": "ex_045", "name": "Goblet Squat"}],
    "hamstrings": [{"id": "ex_078", "name": "Romanian Deadlift"}]
  },
  "recentPerformance": {"avgRPE": 6.2, "completionRate": 0.83, "flaggedPain": ["left knee"]}
}
```

```json
// REQUIRED output shape — engine re-validates every field before trusting it
{
  "selectedExerciseIds": ["ex_112", "ex_078"],
  "excludedExerciseIds": ["ex_045"],
  "exclusionReasons": {"ex_045": "user-flagged knee limitation"},
  "progressionSuggestions": [{"exerciseId": "ex_078", "action": "increase_reps", "amount": 1}],
  "coachNote": "Swapped in Leg Press instead of Goblet Squat to protect your knee this week."
}
```

Keep temperature low (0.2–0.4) for this task — it's selection/classification, not creative writing. The AI **never** invents an exercise ID, never sets sets/reps/rest directly (the engine does), and every `selectedExerciseIds` value must exist in the candidate list it was given — reject and fall back deterministically if not.

## 12. Recommended Exercise Database Structure

Today's schema (`{id, name, bodyPart, equipment, target, instructions}`, no difficulty/movement-pattern/contraindication fields, and duplicated across 4 files) should be replaced by one canonical collection:

```
{
  id, name, aliases: string[],
  primaryMuscle, secondaryMuscles: string[],
  equipment: string[],              // canonical enum, not free text
  movementPattern: "push" | "pull" | "squat" | "hinge" | "carry" | "rotation" | "isolation",
  exerciseType: "compound" | "isolation" | "cardio" | "mobility",
  difficulty: "beginner" | "intermediate" | "advanced",
  beginnerSuitable: boolean,
  defaultVolume: { goal: { sets, repsRange, restSeconds } },   // per-goal defaults, not one global table
  contraindications: string[],      // e.g. "knee", "lower_back", "shoulder"
  substitutes: string[],            // other exercise ids, same muscle+pattern
  cues: string[],                   // real, exercise-specific form cues (replaces today's boilerplate)
  instructions: string[],
  gifUrl, videoUrl,
  unilateral: boolean,
}
```

Recommend seeding this as your own Firestore/JSON collection (own it, don't depend on an unauthenticated public mirror) — either by cleaning and re-normalizing the existing ExerciseDB data pull, or licensing/self-hosting a maintained open dataset. This removes the outage/rate-limit risk of `exercisedb-api.vercel.app` entirely.

## 13. Recommended Plan JSON Schema

```json
{
  "planId": "uuid",
  "userId": "uid",
  "weekNumber": 3,
  "weekStart": "2026-08-24",
  "previousPlanId": "uuid-of-week-2-plan",
  "generationMethod": "hybrid",
  "goal": "Athletic Performance",
  "days": [
    {
      "day": 1,
      "dayOfWeek": "Monday",
      "focus": "Push",
      "exercises": [
        {
          "exerciseId": "ex_112",
          "sets": 3,
          "reps": "8-12",
          "restSeconds": 90,
          "progressionFromLastWeek": {"metric": "weight", "delta": 2.5},
          "coachNote": "Up 2.5kg from last week — you hit all sets at RPE 6."
        }
      ]
    }
  ],
  "warmup": [...], "cooldown": [...],
  "nutrition": {...}, "recovery": {...},
  "validation": {"status": "passed", "checksRun": [...], "repairsApplied": []},
  "createdAt": "...", "aiRationale": "This week increases lower-body volume slightly based on strong completion..."
}
```

Key changes vs. today: plans are versioned and linked to their predecessor (`previousPlanId`), `weekly_split` becomes structured (`dayOfWeek`/`focus`) instead of a display string, every exercise carries its own progression delta instead of a global copy-pasted sets/reps block, and a `validation` block records what was checked so failures are auditable.

## 14. Recommended Validation Layer

Run this on **every** generated plan (deterministic-only or AI-touched) before it's written to Firestore, and never let a failure block the user — always fall back to the last-known-good deterministic output:

1. **Schema validation** (e.g. `zod`/`ajv`) — required fields present, correct types.
2. **Referential validation** — every `exerciseId` exists in the canonical exercise collection.
3. **Equipment validation** — every exercise's equipment ⊆ user's `availableEquipment` (or bodyweight).
4. **Injury/contraindication validation** — no exercise whose `contraindications` intersects the user's flagged limitations.
5. **Duplicate check** — no exercise repeated within a day; cap repeats across the week (e.g., max 2×/week per exercise) unless the split intentionally repeats a pattern.
6. **Volume/safety bounds** — total weekly sets per muscle group within a min/max band for the user's experience level; estimated session duration (`Σ sets × (work + rest)`) within a tolerance of what the user can commit.
7. **Malformed-JSON handling** (once AI is in the loop) — if the model's response fails to parse or fails schema validation, retry once with a stricter instruction, then discard the AI layer entirely and ship the deterministic engine's own valid plan rather than surfacing an error to the user.

## 15. Recommended Weekly Progression System

Read, at minimum, from `firebaseWorkoutHistory.js`: completion rate for the prior week, per-exercise weight/rep trend (already computed by `getExerciseProgress`), average RPE/difficulty, any pain/discomfort flags (needs to be added — see §16), and missed-day count. Apply simple, explainable rules first (increase load/reps when prior sets were completed comfortably; hold or reduce when RPE was high or sets were missed; substitute out any exercise flagged with pain; insert a deload week every 4–6 weeks or after a detected high-fatigue pattern) — let the AI layer phrase these as coaching notes, not invent them.

**Generation timing — use a combination, not purely on-demand:**
- A **scheduled Cloud Function** (Cloud Scheduler → Pub/Sub → Function) runs shortly before each user's `nextPlanDue`, proactively generating next week's plan server-side so it's ready when they open the app — this is what makes "Week 2 built from Week 1" actually automatic rather than manual.
- Keep an **on-demand "Regenerate"** action in-app for the user's own control (e.g., after they've changed equipment or goals, once that editing UI exists).
- Keep a **client-side fallback check on app open** (today's `checkPlanExpiry`) as a backstop for the scheduled job not having run yet (new signups, timezone edge cases) — but have it call the backend to generate immediately rather than just showing a "you're on your own" button.

## 16. Recommended Chatbot Architecture

Move the call server-side (Cloud Function). On each message: fetch the user's profile, current plan summary, and a compact recent-history summary (last 7–14 days' completion/RPE, not the raw full history — control token budget), build a system prompt that grounds the model in that data and instructs it to say "I don't have that information" rather than guess, and persist the conversation in `users/{uid}/chatHistory` so it survives app restarts and can be resumed. Add an explicit safety instruction for pain/medical questions (acknowledge, suggest consulting a professional, don't diagnose). This directly fixes the "why did you give me squats today?" case in the brief — the model would actually see today's assigned exercises and could answer correctly.

## 17. Chatbot + Workout Engine Integration

The chatbot should **never write directly to Firestore**. For a request like *"replace barbell squats, my gym doesn't have a barbell"*, the flow should be: chatbot recognizes an actionable request → calls a controlled backend action (`requestExerciseSubstitution(exerciseId, reason)`) → that action runs the **same** equipment/contraindication/substitute logic as plan generation → returns a proposed diff to the chat ("Swap Barbell Squat → Goblet Squat?") → user confirms → only then is Firestore updated, through the same validation layer as any other plan write. This keeps the LLM as a natural-language front door to a deterministic, auditable action, not an autonomous database editor.

## 18. Recommended Backend Changes

- Stand up Firebase Cloud Functions (zero new infra given the existing Firebase project): `generatePlan`, `regeneratePlan`, `chatWithCoach`, `requestPlanEdit` (callable), and one scheduled function for weekly rollover.
- Move `GROQ_API_KEY`/new Gemini key into Cloud Functions config or Secret Manager — remove both from `.env`/the client bundle entirely, and rotate both existing keys regardless (see §21).
- Port the deterministic engine (today's `generateWorkoutPlan.js` logic) to run server-side so it can read history without a round trip, and so it's the shared source of truth for both generation and validation.
- Audit Firestore security rules (not reviewed in this pass — the client currently reads/writes several collections directly, so rule correctness is now a hard security dependency; verify users can only read/write their own `uid`/`Users` documents).
- Own the exercise database (own Firestore collection or bundled dataset) instead of depending on an unauthenticated public mirror.

## 19. Recommended Frontend Changes

- Remove all `@env`-bundled AI keys; replace direct `axios` calls to Groq/ExerciseDB with calls to the new backend endpoints.
- Adopt React Query for all Firestore/backend reads (plan, history, chat) — replaces the current hand-rolled per-screen loading/error state and gets caching/retry for free.
- Add missing profile-edit screens for goal, equipment, experience, and weekly frequency (currently impossible to change after onboarding).
- Fix `EditRoutine.js`'s data-shape bug (`exercise.workoutDetails.sets`, not `exercise.sets`).
- Unify the exercise-selection UI/data across `AddExercise.js`, `ManualWorkout.js`, and `EquipmentWorkoutsScreen.js` onto one shared list/component and one equipment vocabulary (fixing the "Dumbells" typo and unmapped-equipment issues in the process).
- Add RPE/difficulty and pain/discomfort input to both workout-completion screens, and consolidate the two disconnected "finish workout" write paths into one.
- Persist and restore chat UI state from the (now server-persisted) chat history on screen mount.
- Add error boundaries around plan-rendering screens; remove the unconditional `console.log(userData)`.

## 20. QA Test Cases (User Journey)

| Stage | What to verify |
|---|---|
| Onboarding → Questionnaire | Every screen persists on "Next"; back-navigation pre-fills previous answers; "you can skip any question" copy in `IntroQuestionnaire` is either made true or removed (currently false — every screen blocks on empty). |
| Profile completeness gate | `Decider.js`'s `isProfileComplete` check against all 18 fields behaves correctly for partially-completed profiles; verify the (currently dead) `checking` state isn't masking a real loading gap. |
| Plan generation | Each of the 8 goal options produces a *distinct* template (today only 2 do — this should fail until §2/§9 fixes land); equipment selections map to actually-filtered exercise lists; injury/limitation text excludes matching exercises once implemented. |
| First workout | Sets/reps/rest render correctly per exercise; "Skip Exercise" behavior is intentional and recorded, not silently dropped. |
| Workout completion | Both completion paths (`PullPushDay` and `StartFullWorkoutScreen`) write to the same history store; RPE/pain fields (once added) are captured and stored. |
| Progress tracking | Statistics screen never shows placeholder data without labeling it as such; empty states render correctly for brand-new users (verify `getUserWorkoutStats` doesn't throw on an empty history — currently a plausible crash path). |
| Weekly transition | `nextPlanDue` expiry triggers proactive (not just on-open) regeneration; regeneration never destroys the prior week's completion record. |
| Next plan generation | Verify the new plan actually differs based on prior completion/performance, not just a fresh random draw. |
| AI chatbot | Ask "why did you give me squats today?" and "I couldn't complete 3 sets yesterday" — verify grounded, plan-aware answers once §16 lands; verify conversation survives app restart. |
| Returning user | Opening the app after several weeks correctly flags every stale plan rather than silently cycling through old content via the day-index modulo. |
| Error/offline | Every Firestore/network call has a user-visible error state, not just a `console.log`. |

## 21. Edge Cases (from the brief, mapped to current behavior)

- **User skips onboarding / partial questionnaire:** currently impossible to reach the app in a partial state — `Decider.js` forces completion of all 18 fields before granting access; a user who quits mid-flow restarts at the very first screen (with prior answers pre-filled, so no data loss, just repeated taps).
- **AI generation fails / times out / returns invalid JSON:** not applicable to today's rule-based generator (it degrades silently to local data instead of failing); becomes directly relevant once §9/§14 land — this is exactly what the validation-and-fallback layer must handle.
- **No workout history / one workout only / whole week skipped:** today, irrelevant to generation (history isn't read at all); after §15, must be explicitly tested — a single data point shouldn't overreact (e.g., don't deload after one high-RPE session).
- **User changes goal/equipment/frequency/difficulty:** currently impossible post-onboarding (§8 medium finding) — this is a prerequisite gap to close before "changes propagate to next week" can even be tested.
- **User deletes/restarts their plan:** no explicit "reset" flow was found; regeneration is the only reset mechanism, and it currently destroys history as noted in §5.
- **Opens app after several weeks / stale cached plan:** silently shows old content via the modulo day-index (§3) rather than clearly flagging staleness everywhere, not just on Home.
- **Offline:** most screens have no explicit offline messaging; Firestore's default offline persistence may mask this partially, but errors are frequently only `console.log`'d, not shown to the user.
- **Two simultaneous generation requests:** confirmed race condition, no lock (§5/§8 critical finding #10).

## 22. Security / Privacy Considerations

- **Rotate the exposed OpenAI and Groq keys now** — treat both as compromised regardless of anything else, since they've been sitting in a client-bundled `.env`. Remove the unused OpenAI key entirely if there's no near-term plan to use it.
- **Never ship a third-party AI/API key in a mobile bundle again** — this is the core reason for the Cloud Functions broker in §9/§18.
- **PII/health-adjacent data:** the questionnaire collects age, weight, height, dietary restrictions, allergies, and (once added) injury/pain data — treat this as sensitive. Stop the unconditional `console.log` of the full profile object, and audit Firestore security rules so users can only read/write their own documents (not verified in this pass — should be a priority follow-up).
- **Third-party data exposure:** chat messages currently go to Groq with no filtering — avoid having the client (or future backend) send unnecessary PII (full name, etc.) into chat prompts; only inject what's needed for the answer.
- **Unauthenticated external dependency:** `exercisedb-api.vercel.app` receives no user data today (good), but as an unofficial, unauthenticated public mirror it's a single point of failure with no visibility into its own data-handling or licensing terms — a reason to own the exercise catalog (§12) rather than depend on it long-term.
- Consider a basic data-retention/export/delete story given the health-adjacent nature of the data (dietary/allergy/injury fields), even if not strictly required at current scale.

## 23. Cost Considerations

- **Gemini 2.5 Flash / Flash-Lite:** free-of-charge input/output tokens on the current official free tier (verified live for this audit) — a reasonable $0 starting point for the structured personalization/validation calls, with paid-tier pricing (~$0.10–$0.30/1M input, ~$0.40–$2.50/1M output depending on model) available to fall back on if usage grows past free-tier limits (check current limits in AI Studio before committing to a launch date, since they're usage-tier dependent and not published as fixed numbers).
- **Groq:** already integrated, historically generous free tier for the small `llama-3.1-8b-instant`/`llama-3.3-70b-versatile` models — verify current limits in the Groq console for your account before relying on them for chatbot volume.
- **Cloud Functions:** usage-based, cheap at any realistic current scale for this app; the scheduled weekly-regeneration function will be one invocation per user per week, negligible cost.
- **Owning the exercise database** (own Firestore collection instead of the external mirror) removes an availability risk at effectively zero marginal cost, since the data is largely static.

## 24. Step-by-Step Implementation Roadmap

**Phase 0 — This week, independent of everything else:** rotate/revoke the exposed OpenAI and Groq keys; confirm `.env` is gitignored going forward (check git history for whether it's already committed and needs scrubbing); remove the dead OpenAI key entirely if unneeded.

**Phase 1 — Backend foundation:** stand up Cloud Functions; move the existing Groq chat call server-side unchanged (quick win — same model, just proxied, keys off the client); add Firestore-backed chat history persistence.

**Phase 2 — Harden the deterministic engine:** fix `normalizeGoal()`'s exact-match bug; wire in the currently-ignored questionnaire fields (`currentPhysique`, `energyLevel`, `foodAllergies`/`dietaryPreferences` for the nutrition section, `modifications` for exercise exclusion); unify the four exercise-vocabulary lists into one canonical set (fixes the "Dumbells" bug); add the validation layer (§14).

**Phase 3 — History-aware generation:** read `firebaseWorkoutHistory` data into generation; implement the progression rules in §15; add RPE/pain capture to both completion screens; unify the two disconnected "finish workout" write paths; switch plan writes to a transaction/merge pattern that never clobbers `completed_workouts`.

**Phase 4 — AI-assisted personalization + grounded chatbot:** add the Gemini-based personalization/validation layer from §9/§11; rebuild the chatbot per §16/§17 with profile/plan/history grounding and controlled action-calling.

**Phase 5 — Automation:** scheduled Cloud Function for proactive weekly regeneration; push notifications for plan-ready/plan-expiring.

**Phase 6 — Polish:** adopt React Query app-wide; ship the missing post-onboarding profile-edit screens; expand exercise metadata per §12; fix the remaining medium-priority bugs (`EditRoutine.js` crash, dead code, Statistics placeholder data); run the full QA/edge-case matrix in §20/§21 before calling this shipped.

---

## 25. Manual Workout Creation Flow ("Build Your Own Plan" Fallback)

When plan generation fails, `WorkoutGenerating.js` offers "Or create workout manually →", which opens `ManualWorkout.js`. This is a genuinely separate code path worth auditing on its own, since it's the app's only fallback when the AI/rule engine can't produce a plan.

- **UX shape:** one long single-screen scrolling form, not a step-by-step wizard — goal chips, a 1–7 "days per week" selector (auto-generates a canned Push/Pull/Legs-style split preview), a horizontal day picker, and an "Add Exercise" modal per day, plus separate modals for editing the guidelines/nutrition/recovery text blocks. No review/summary step before saving.
- **Exercise entry is a free-text form, not a database lookup.** Exercise **name** and **target muscle** are plain `TextInput`s — no autocomplete, no ExerciseDB search, no GIF/instructions (every manually-added exercise gets a canned instruction string, "Perform with proper form and control"). Only body part and equipment are constrained to chip lists. This is markedly worse than the exercise-search experience that already exists elsewhere in the app (`AddExercise.js`, reachable from `PullPushDay.js`) which *does* call the same `searchExercises`/`getExerciseCategories` functions the AI generator uses, with live filtering and GIFs — that component is simply never reused inside the manual-builder flow.
- **The good news:** whoever built `ManualWorkout.js` clearly reverse-engineered the AI generator's exact output shape. It saves to the same `workouts/{uid}` Firestore document, with the same `plan.userProfile / weekly_split / daily_workouts / warmup / cooldown / workout_guidelines / nutrition / recovery` structure and the same `"Day N: Label"` convention, and it sets `weekStart`/`nextPlanDue` identically. As a result, a manually-built plan **does render correctly** in `Home.js` and `Myplan.js`, and **does** participate in the same weekly expiry/regeneration logic as an AI-generated one — this part is a genuine, deliberate piece of integration work, not an oversight.
- **Where it breaks: the very next action a user takes.** Tapping "Edit" on any day from `Myplan.js` (manual or AI-generated plan, doesn't matter) opens `EditRoutine.js`, which reads `exercise.sets.toString()` and `exercise.reps` as flat top-level fields — but every real exercise object (manual or AI) nests these under `exercise.workoutDetails.{sets, reps}`. This throws immediately, so **editing a saved day currently crashes for every plan in the app**, manual ones included. This is the same bug already flagged in §5 as critical finding #9, and it lands squarely in this flow too.
- **Validation gaps:** only a total-exercise-count-greater-than-zero check on save; no per-day minimum (a user can dump everything into Day 1 and leave the rest empty), no duplicate-exercise detection, no cap on exercises per day, no bounds on sets/reps (a blank or non-numeric entry silently becomes a default rather than being flagged), and rest-day labels don't actually block adding exercises to a "Rest" day. No "discard changes?" confirmation on back-navigation, so a long manually-built plan can be lost with one accidental tap.
- **Orphaned adjacent screens.** `AddRoutine.js`, `StartNewWorkout.js`, `ExerciseForm.js`, and `SaveRoutineDate.js` are all registered in navigation but have **no live call sites anywhere in the app** — dead code from what looks like an earlier, incompatible "routines" data model. `AddRoutine.js` is actively dangerous if it's ever reconnected: it does a bare `.set({plan: routineData})` with no `merge: true` and a differently-shaped payload, which would wholesale replace (and corrupt) the current plan document.

**Verdict:** the manual path is a partially-built escape hatch, not a fully working alternative to AI generation. The data-contract compatibility work is solid, but the exercise-entry UX is a step backward from what already exists elsewhere in the app, validation is thin, and the first natural follow-up action (editing a day) crashes regardless of how the plan was created. Fixing the shared `EditRoutine.js` bug (§5, finding #9) and swapping `ManualWorkout.js`'s free-text exercise modal for the existing `AddExercise.js` search component would close most of the gap here.

## 26. UI/UX Improvement Recommendations

This is a code-level review of styling/structure (colors, typography, spacing, navigation chrome, accessibility) across the shared component library, the theme file, and a representative sample of screens — not a rendered visual review. `constants/theme.js` and the `CommonComponent` library do exist and are reasonably designed (they include a `Spacing` scale — `xs:4` through `xxl:48` — and a `BorderRadius` scale already); the issue is inconsistent *adoption*, not a missing design system.

**Verdict:** the Login/SignUp/Onboarding-Questionnaire flow is genuinely disciplined — it consistently uses the shared `Button`, `Heading`, `Paragraph`, `Option`, and `DoubleButton` components and theme tokens, with Formik+Yup validation and inline error text. The core app (`Home`, `Settings`, `JimAI`, `StartFullWorkoutScreen`, `TodaysFocusScreen`, `Help`, and to a lesser extent `Myplan`/`Health`/`Profile`) has drifted away from that system — each screen has re-derived its own colors, its own spacing, and its own header/loading/empty-state pattern, producing a visibly less cohesive experience than the onboarding flow gives.

**Confirmed, concrete issues (verified directly against `theme.js`/`Button.jsx`, not just inferred):**

1. **A real, live bug in the shared `Button` component.** `CommonComponent/Button.jsx` destructures a prop named `disbaled` (typo, missing the "a") instead of `disabled`, and uses it for `TouchableOpacity`'s `disabled` attribute. Most call sites accidentally match the typo (`disbaled={loading}` in `Login`, `SignUp`, `AgeQuestionnaire`, `GenderQuestionnaire`, `HeightQuestionnaire`) and so work by coincidence. But `GoalsQuestionnaire.js` (line 103) uses the *correctly spelled* `disabled={loading}` — which `Button.jsx` doesn't recognize, so **the "Continue" button on the Goals screen never actually disables or shows protection against double-tap during the async submit**, unlike its sibling questionnaire screens. Fix the prop name in `Button.jsx` once, then fix the five mismatched call sites to use `disabled` — a small, mechanical change with a real correctness payoff.
2. **A malformed color already shipped in `theme.js` itself.** `Colors.grey: "#3656565"` is a 7-character hex string — not a valid 3/4/6/8-digit color — so it won't render as intended anywhere it's used. This exact broken value was also copy-pasted into `WorkoutGenerating.js`'s local "temporary" theme fallback (added because that screen's author wasn't confident `theme.js` would resolve — see next point), so the bug is duplicated as well as broken at the source.
3. **At least six main-tab screens (`Home.js`, `Myplan.js`, `Settings.js`, `StartFullWorkoutScreen.js`, `TodaysFocusScreen.js`, `Help.js`) each paste an identical, verbatim 16-line `darkColors` object** rather than using the already-imported `Colors` from `theme.js` — and several of those same files use `Colors.x` and `darkColors.x` interchangeably a few lines apart. If the real brand color in `theme.js` ever changes, six independent copies won't follow it.
4. **Typeface mixing, not a token-naming bug.** `theme.js` legitimately defines two separate type families — short names (`Fonts.Medium`, `.Bold`, etc.) mapped to Poppins, and prefixed names (`Fonts.Montserrat_Bold`, etc.) mapped to Montserrat, plus a Lora set. Several screens (`SignUp`, `GoalsQuestionnaire`, `HeightQuestionnaire`, `GenderQuestionnaire`, `AgeQuestionnaire`, `ForgetPassword`) use *both* families in the same screen — that's a genuine visual-consistency question worth a design decision (pick one typeface per screen/section), even though it's not a technical bug. Separately, `Settings.js`/`StartFullWorkoutScreen.js`/`TodaysFocusScreen.js`/`Help.js` hardcode the raw string `"Montserrat-Bold"` instead of importing `Fonts.Montserrat_Bold` — the values match today so it isn't broken, but it bypasses the token and will silently drift if the font mapping is ever refactored.
5. **Spacing is not actually standardized despite a scale existing.** `theme.js` already exports `Spacing` (4/8/16/24/32/48) and `BorderRadius` tokens, but the sampled main-tab screens don't use them — `Home.js` has ~52 raw pixel padding/margin values, `StartFullWorkoutScreen.js` ~86, `Myplan.js` ~33 — while `RFPercentage` (used for scalable spacing elsewhere) appears zero times in `Home.js`, `TodaysFocusScreen.js`, `Health.js`, and `Profile.js`. This is an adoption gap, not a missing-tool gap.
6. **No accessibility props anywhere** (`accessibilityLabel`/`accessibilityRole`/`hitSlop` — zero matches across the sampled screens and shared components), and back-button touch targets are inconsistent (some wrapped in a proper 40×40 hit area, `Myplan.js`'s is not). `TodaysFocusScreen.js` has no back button at all, relying entirely on the OS gesture/hardware back.
7. **Header/back-button pattern is reinvented five different ways** — two different icon libraries (`AntDesign` vs `Ionicons`) and several different icon sizes/hit-box treatments across `Myplan`, `Settings`, `Help`, and the Questionnaire screens, with no shared `ScreenHeader` component.
8. **Loading/empty states have no shared component** — plain inline `ActivityIndicator`s with inconsistent sizing/color, a completely different "typing dots" pattern in `JimAI.js`, and two independently-worded one-line empty states in `Home.js`/`Myplan.js`.
9. **`KeyboardAvoidingView` is missing its `behavior` prop** in `Login.js`, `SignUp.js`, `Diets.js`, and `Challenges.js` — on iOS this wrapper does nothing without an explicit `behavior="padding"` (the correct pattern already exists in `ForgetPassword.js`/`ProfileQuestionaire.js`/`JimAI.js` and should just be copied over).

**Prioritized, no-redesign-required action list:**

1. Fix `Button.jsx`'s `disbaled`→`disabled` prop and its five mismatched call sites (real bug, one-line-per-file fix).
2. Fix `Colors.grey` in `theme.js` to a valid hex and remove the duplicated bad value from `WorkoutGenerating.js`'s local fallback (or better, delete that local fallback entirely and trust the real import).
3. Delete the six copy-pasted `darkColors` objects; point every reference at the existing `Colors` import.
4. Adopt the existing `Spacing`/`BorderRadius` tokens in the high-magic-number screens (`Home.js`, `StartFullWorkoutScreen.js`, `Myplan.js`) instead of introducing anything new.
5. Build one shared `ScreenHeader` (icon + title + optional right slot, one icon library, a real 44×44+ hit area with `hitSlop`) and use it everywhere `headerShown:false` currently forces a hand-rolled header — add it to `TodaysFocusScreen.js`, which has none today.
6. Extract one `EmptyState`/`LoadingState` component for the screens that currently invent their own.
7. Add `accessibilityLabel`/`accessibilityRole` to icon-only controls, starting with the new shared header/button components so the fix propagates everywhere at once.
8. Fix the missing `behavior` prop on the four `KeyboardAvoidingView` usages noted above.
9. Pick one typeface convention per screen (don't mix Poppins and Montserrat within the same view) as a lightweight design decision, and replace the raw `"Montserrat-Bold"`-style string literals with their `Fonts.*` token equivalents for maintainability.

---

*This report is an audit only — no code was modified. Sections 2–8 cover the requested items 1–8, 9–24 cover items 9–23 in order (with items 6–8, "problems found," consolidated into one prioritized list per severity rather than repeated three times), and §25–26 are the follow-up UI/UX and manual-plan-creation review requested afterward.*
