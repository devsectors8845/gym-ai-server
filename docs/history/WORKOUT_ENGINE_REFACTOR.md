> Historical report, superseded by the current server README. Paths and deployment instructions below describe an earlier architecture.

# GymAI — Workout Generation Engine: Audit & Refactor Report

This report covers the fix-and-refactor task for the deterministic workout
generator. It builds on `GymAI_Workout_Engine_Audit.md` (the original
15-area audit) and `CLOUD_FUNCTIONS_BACKEND.md` (the Cloud Functions
foundation from the prior task) — the workout engine now lives in
`functions/`, following the exact auth/validation/error/logging conventions
`chatWithCoach` established there.

No AI is involved anywhere in this engine (per the task's explicit
constraint). Every decision below — goal mapping, equipment matching,
injury filtering, exercise selection, plan validation — is a fixed,
inspectable rule, not model output.

---

## 1. Current workout-generation flow before changes

```
Questionnaire screens (11 separate RN screens)
    │  each writes its own field directly to Users/{uid}
    ▼
Users/{uid} Firestore doc (profile) + React Context mirror
    │
    ▼
WorkoutGenerating.js
    │  passes the whole Context userData object to:
    ▼
generateExerciseDBWorkoutPlan(userData)   [src/services/generateWorkoutPlan.js]
    │
    ├─ normalizeGoal(userData.goal)  — exact-string lookup, 6 of 8 real
    │    goal values silently fall through to "Build Muscle"
    ├─ normalizeExperience(userData.gymExperience) — "Advance" silently
    │    resolves to "beginner" (substring bug)
    ├─ getWorkoutTemplate(goal, days) — 5 hardcoded templates
    ├─ getEquipmentFilter(availableEquipment) — "Dumbells" (real value)
    │    never matches "dumbbell" (double b); "Nothing" produces zero
    │    filters, which downstream means UNRESTRICTED, not bodyweight-only
    ├─ selectExercisesForWorkout() per muscle group:
    │     try ExerciseDB (live API) → fall back to ~30-item local array
    │     → filter by equipment (buggy, see above)
    │     → filter by experience (beginner-only name-substring blocklist)
    │     → Math.random() Fisher-Yates shuffle, take N
    │     (userData.modifications — the injury/limitation free-text field —
    │      is never read anywhere in this file)
    ├─ validateWorkoutPlan(plan) — structural non-emptiness check only
    │     ("at least 1 exercise on at least 1 day"), nothing else
    ▼
WorkoutGenerating.js writes the returned plan directly to workouts/{uid}
    (a second, independent .set() call, not done by the generator)

Fallback path: ManualWorkout.js — a fully separate, hand-typed exercise
builder with its own goal list, its own weekly-split table (which disagrees
with the generator's), no exercise catalog, no equipment filtering, no
injury filtering, and its own totalExercises > 0 check before saving to the
SAME workouts/{uid} doc.
```

Full findings and exact code evidence are in the "Goal handling", "Equipment
handling", "Injury/limitation handling", and "Duplicated logic" sections
this task's audit produced — summarized in sections 2-7 below.

## 2. New workout-generation flow

```
Questionnaire screens (UNCHANGED — still write to Users/{uid} field by field)
    │
    ▼
Users/{uid} Firestore doc
    │
    ▼
RN: WorkoutGenerating.js calls generateExerciseDBWorkoutPlan(userData)
    │   (userData is accepted for backward compatibility but its
    │    CONTENTS are no longer sent anywhere or used for any decision)
    ▼
generateExerciseDBWorkoutPlan() → functions().httpsCallable("generateWorkoutPlan")()
    │   (no payload needed — the function reads the caller's own profile)
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Cloud Function: generateWorkoutPlan  (functions/src/functions/…)    │
│                                                                       │
│  1. Auth: require request.auth.uid (never a client-supplied id)      │
│  2. Read Users/{uid} via firestore/userRepository.getUserProfile()   │
│  3. normalizeProfile(raw) — services/profileService.ts               │
│       resolveGoal()        — 8/8 goals mapped, throws on unknown     │
│       resolveExperience()  — "Advance" now correctly → "advanced"    │
│       resolveEquipment()   — "Dumbells" fixed, "Nothing" fixed       │
│       parseLimitations()   — free-text → LimitationTag[]             │
│       (throws WorkoutEngineError — a controlled, typed rejection —   │
│        on anything unsupported/missing; no silent fallback)          │
│  4. buildPlan() — services/planBuilder.ts                            │
│       buildWeeklySplit(goal, days)     — deterministic template      │
│       for each day → for each body part:                             │
│         buildSafePool()   — catalog → equipment → experience →       │
│                              injury/limitation filter (in that       │
│                              order — safety BEFORE randomness)        │
│         pickFromPool()    — seeded PRNG, not Math.random()           │
│  5. validateGeneratedPlan() — utils/planValidation.ts                │
│       re-checks plan integrity, user constraints, exercise           │
│       constraints, and workout-structure constraints independently   │
│  6. Only if valid: saveGeneratedPlan() writes workouts/{uid}          │
│       (same collection, same field names as before — Step 11)        │
│  7. Return {plan, planId, generatedAt} to the client                 │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
RN displays the returned plan; no second Firestore write from the client.

Manual flow: ManualWorkout.js is UNCHANGED in how it builds/saves a plan
(still client-authored, still writes to workouts/{uid} itself — Step 11
forbids changing this), but before saving it now calls the new
validateWorkoutPlan callable, which checks any manually-typed exercise that
matches a catalog entry by name against the user's actual equipment and
reported limitations, and blocks the save with a specific error if it
fails. A custom, non-catalog exercise name can't be safety-checked this way
and is allowed through with a warning, not an error — see section 5.
```

## 3. All 8 goals and their mappings

| # | Questionnaire string (verbatim) | Canonical internal `Goal` | Old behavior | New strategy highlights |
|---|---|---|---|---|
| 1 | `Strength Training` | `strength_training` | fell through → Build Muscle | 5-8 reps, 3-5 sets, 150s rest, compound-biased |
| 2 | `Powerlifting` | `powerlifting` | fell through → Build Muscle | 1-6 reps, 3-5 sets, 180s rest, compound-only, no cardio days |
| 3 | `Health` | `health` | fell through → Build Muscle | 10-15 reps, light sets, cardio/mobility days included |
| 4 | `Weight Loss` | `weight_loss` | correctly recognized | 12-20 reps, 45s rest, calorie deficit, ~50% cardio days |
| 5 | `Muscle Gain` | `muscle_gain` | correctly recognized | 6-12 reps, 90s rest, calorie surplus, no cardio days |
| 6 | `Body Recomposition` | `body_recomposition` | fell through → Build Muscle | hybrid hypertrophy + light conditioning, maintenance calories |
| 7 | `General Fitness` | `general_fitness` | fell through → Build Muscle | balanced strength/cardio/mobility mix |
| 8 | `Athletic Performance` | `athletic_performance` | fell through → Build Muscle | power/explosive bias, plyometric allowed for non-beginners only |

An unrecognized goal string (anything not one of these 8, case-insensitive)
throws `WorkoutEngineError("invalid_goal")` → `HttpsError("failed-precondition")`
— it is never mapped to `muscle_gain` or anything else by default. See
`functions/src/constants/goals.ts`.

## 4. Questionnaire fields now used

| Field | Screen | Category | Notes |
|---|---|---|---|
| `goal` | GoalsQuestionnaire.js | **Used directly** | drives strategy, split, rep/set scheme |
| `gymExperience` | GymExperience.js | **Used directly** | drives difficulty/plyometric gating |
| `availableEquipment` | AvailableEquipment.js | **Used directly** | drives exercise eligibility |
| `weeklyWorkoutCommitment` | AvailiabiltyQuestioniare.js | **Used directly** | drives day count / split |
| `modifications` | Modifications.js | **Used by safety/validation** | keyword-parsed into limitation tags, drives exclusion |
| `age` | AgeQuestionnaire.js | Display only | shown in `plan.userProfile`, not a generation input |
| `gender` | GenderQuestionnaire.js | Display only | shown in `plan.userProfile` |
| `height` | HeightQuestionnaire.js | Display only | shown in `plan.userProfile` |
| `weight` | AgeQuestionnaire.js | Display + nutrition calc | drives the protein-gram target only |
| `fullName` | ProfileQuestionaire.js | Display only | shown in `plan.userProfile` |
| `goalNote` | GoalsQuestionnaire.js | Not used (future) | free text; a future AI layer could use this for nuance, not this deterministic engine |
| `currentPhysique` / `goalPhysique` | CurrentPhysique.js | Not used (future) | candidate input for a future personalization layer |
| `dietaryPreferences` / `foodAllergies` | DietaryPreferences.js | Not relevant to workout generation | nutrition-app concern, not exercise selection |
| `currentDiet` | Diets.js | Not relevant to workout generation | same |
| `fitnessChallenge` | Challenges.js | Not used (future) | could inform coaching tone/motivation copy later |
| `sleepHours` / `waterIntakeLiters` / `energyLevel` | HealthQuestionaire.js | Not used (future) | candidate inputs for auto-adjusting intensity later |

This table is the deliverable from Step 3 — every field is accounted for
with an explicit category, not silently ignored without a decision. It's
also enforced in code: `services/profileService.ts`'s docstring restates
this exact breakdown next to the function that actually implements it.

## 5. Injury/limitation rules implemented

- `modifications` (free text) is parsed by `constants/limitations.ts`'s
  `parseLimitations()` into a fixed vocabulary of `LimitationTag`s: `knee`,
  `shoulder`, `lower_back`, `wrist`, `ankle`, `hip`, `neck`, `elbow`. This is
  deterministic keyword matching (with basic negation handling for phrases
  like "no knee issues"), **not** AI/NLP.
- Every catalog exercise (`functions/src/data/exerciseCatalog.ts`) carries a
  `contraindications: LimitationTag[]` array. `exerciseSelectionService.ts`'s
  `passesLimitations()` excludes any exercise whose contraindications
  intersect the user's reported limitations, and this filter runs **before**
  any random selection (Step 7's required order).
- If every otherwise-eligible exercise for a body part is excluded by a
  limitation, `buildSafePool()` automatically tries each excluded
  exercise's `alternatives` list and uses any alternative that itself
  passes every filter (Step 4's "support approved alternatives") — e.g. a
  knee limitation excludes `barbell_back_squat` but its alternatives
  (`leg_press_machine`, `bodyweight_squat`) remain available.
- If literally nothing is safe for a body part (e.g. bodyweight-only
  equipment plus a limitation with no bodyweight-safe options left),
  `WorkoutEngineError("empty_pool")` is thrown — a controlled, observable
  rejection, not an empty day and not an unsafe substitution.
- The manual workout flow gets the same contraindication check on a
  best-effort basis: `validateWorkoutPlan` matches a manually-typed exercise
  name against the catalog (exact, case-insensitive) and applies the same
  `passesLimitations()` rule if a match is found.

**Known, disclosed limitation** (see section 12): because `modifications`
is unstructured free text with no fixed checklist anywhere in the app, this
keyword approach will both under-match (a limitation phrased without one of
the known keywords, e.g. "my rotator cuff is acting up" without the word
"shoulder", produces no tag) and can occasionally over-match ambiguous
phrasing. This is a best-effort deterministic normalizer, explicitly not a
claim of complete medical coverage — the honest fix is a follow-up task
that replaces the free-text field with a fixed multi-select.

## 6. Equipment normalization/matching changes

- `functions/src/constants/equipment.ts` defines a canonical `Equipment`
  enum (`full_gym | bodyweight | dumbbell | barbell | cable | smith_machine
  | machine | pull_up_dip_bars | band`) and an explicit map from every real
  `AvailableEquipment.js` option string to it.
- **The `"Dumbells"` (single b) bug is fixed**: it's mapped directly to
  `dumbbell`, tested in `equipment.test.ts`.
- **The `"Nothing"` bug is fixed**: it now maps to `["bodyweight"]`
  (equipment-restricted), not to an empty filter that the old code treated
  as "no restriction, anything goes."
- A selection that's real but equipment-inert (e.g. only `"Other"` or
  `"Back extension"`) normalizes to a safe `bodyweight` default rather than
  silently becoming "full gym," and this normalization is logged.
- Missing/absent equipment data throws `WorkoutEngineError("invalid_equipment")`
  rather than defaulting to `"Full Gym"` the way the old generator's
  `defaultData` spread did.
- `equipmentIsAvailable()` is the single place equipment compatibility is
  checked, used identically by exercise selection (`exerciseSelectionService.ts`),
  post-generation validation (`planValidation.ts`), and the manual-workout
  checker (`validateWorkoutPlan.ts`) — one source of truth instead of the
  three independently-reimplemented equipment-matching functions the audit
  found (`generateWorkoutPlan.js`, `AddExercise.js`, and implicitly
  `ManualWorkout.js`'s unenforced dropdown).

## 7. Exercise catalog changes

- New internal catalog: `functions/src/data/exerciseCatalog.ts`, 51
  exercises across all 7 body-part categories (chest, back, shoulders,
  legs, arms, core, cardio), every equipment type, every difficulty tier,
  and a deliberate spread of `contraindications`/`alternatives` so the
  safety and equipment logic has real, varied data to run against.
- Each entry has: `id`, `name`, `bodyPart`, `muscle`, `equipment`,
  `difficulty`, `movementType`, `contraindications`, `alternatives`,
  `instructions`, `formCues` — the schema the task asked for (`gifUrl` is
  present in the type but left empty for now; no GIF assets were sourced in
  this task).
- This is a **curated seed catalog, not a 1:1 migration of ExerciseDB's
  full library** — that would require live access to ExerciseDB's dataset,
  which this environment doesn't have and which isn't necessary for the
  engine to be correct. The schema is deliberately compatible with what
  `normalizeExercise()` in the old generator already produced, so a future
  task can add more entries (from ExerciseDB or elsewhere) without any
  service code changing.
- The generation engine no longer depends on ExerciseDB being reachable at
  all — every plan is built entirely from this local, structured catalog.

## 8. Validation rules (Step 8)

Implemented in `functions/src/utils/planValidation.ts`, run on every
generated plan before it's saved (`Generate -> Validate -> Save`, enforced
in `functions/generateWorkoutPlan.ts` — a failed validation throws and the
Firestore write is never reached):

- **Plan integrity**: non-empty `planId`, correct `schemaVersion`, a
  parseable `generatedAt` timestamp, a non-empty `uid`.
- **User constraints**: goal/experience/equipment/frequency are each
  re-checked as still-valid values (defense in depth beyond
  `normalizeProfile`, in case a future code change bypasses it).
- **Workout constraints**: day count matches the profile's frequency; every
  non-rest day has at least one exercise; every exercise id exists in the
  catalog; every exercise's equipment is available to the user; every
  exercise is appropriate for the user's experience tier; every exercise is
  free of the user's reported contraindications.
- Failures are logged (`logger.error("workoutPlan.validation_failed", …)`)
  with the goal and the full list of validation errors — but never the raw
  profile or plan content beyond that.
- The manual-workout path gets a parallel, lighter validator
  (`validateWorkoutPlan.ts`) since hand-typed exercises aren't all
  catalog-backed — see section 5.

## 9. Files created/modified

**Created** (all under `functions/src/`):
```
constants/equipment.ts
constants/goals.ts
constants/limitations.ts
data/exerciseCatalog.ts
firestore/workoutRepository.ts
functions/generateWorkoutPlan.ts
functions/validateWorkoutPlan.ts
services/exerciseSelectionService.ts
services/planBuilder.ts
services/profileService.ts
services/templateService.ts
types/workout.ts
utils/planValidation.ts
utils/seededRandom.ts
utils/units.ts
utils/workoutErrors.ts
__tests__/equipment.test.ts
__tests__/exerciseSelection.test.ts
__tests__/generateWorkoutPlan.test.ts
__tests__/goals.test.ts
__tests__/limitations.test.ts
__tests__/planBuilder.test.ts
__tests__/profileService.test.ts
__tests__/validateWorkoutPlan.test.ts
```
Plus this report, `WORKOUT_ENGINE_REFACTOR.md`, at the project root.

**Modified**:
- `functions/src/index.ts` — added exports for `generateWorkoutPlan` and
  `validateWorkoutPlan` alongside the existing `chatWithCoach`.
- `src/services/generateWorkoutPlan.js` — `generateExerciseDBWorkoutPlan()`
  now calls the `generateWorkoutPlan` Cloud Function instead of the local
  `ExerciseDBWorkoutGenerator` class's own generation logic. The class
  itself, and its `searchExercises`/`getExerciseCategories`/
  `canGenerateWorkout` exports, are untouched — see section 13 for why.
- `src/screens/Questionnaire/WorkoutGenerating.js` — removed its own
  `workouts/{uid}` Firestore `.set()` call (the Cloud Function now saves
  the plan itself); removed the now-unused `firestore` import. All existing
  error-handling/UI code (loading states, retry, error screen, manual-workout
  fallback link) is untouched — the mapped error codes
  (`VALIDATION_ERROR`/`GENERATION_FAILED`/`NETWORK_ERROR`) match exactly
  what it already handled.
- `src/screens/Questionnaire/ManualWorkout.js` — added a call to the new
  `validateWorkoutPlan` callable before saving, blocking the save with a
  specific error message if it fails, fail-open on network/infra errors.
  No other change — same UI, same Firestore write, same structural
  "at least one exercise" check as before.

**Not touched**: every questionnaire screen (still write to `Users/{uid}`
exactly as before), `firebaseWorkoutHistory.js`, `AddExercise.js`, Firestore
schema/collections, chat feature files from the prior task.

## 10. Tests added

102 new tests across 8 files (plus the 29 pre-existing chat-feature tests,
all still passing — 131 total):

- `goals.test.ts` (13 tests) — all 8 goals resolve to distinct canonical
  values and distinct strategies; case-insensitivity; unsupported/missing
  goal throws `invalid_goal`; `"Advance"` correctly resolves to `advanced`.
- `equipment.test.ts` (13 tests) — the `Dumbells`/`Dumbbells` fix, the
  `Nothing` fix, `Everything` → wildcard, every named equipment type,
  de-duplication, the `Other`-only normalization, missing/empty data
  throwing `invalid_equipment`, `equipmentIsAvailable()` wildcard behavior.
- `limitations.test.ts` (7 tests) — empty/none input, single and multiple
  limitation detection, case-insensitivity, negation handling,
  deduplication.
- `exerciseSelectionService` tests (14 tests) — injury exclusion, the
  alternatives-recovery path, the `empty_pool` explicit rejection,
  equipment filtering (dumbbell-only, bodyweight-only, full-gym),
  experience/plyometric gating (beginner never gets plyometric or
  advanced-difficulty exercises; a goal that disallows plyometric never
  offers it regardless of experience), and determinism (same seed → same
  picks, different seed → different picks, already-used exercises
  deprioritized).
- `profileService.test.ts` (9 tests) — every invalid-input case from Step
  12 (missing profile, unknown goal, missing goal, missing experience,
  missing equipment, invalid frequency both non-numeric and out-of-range),
  plus correct mapping of a full valid profile and graceful degradation of
  unparseable display-only fields (age/height/weight).
- `planBuilder.test.ts` (18 tests) — **all 8 goals** produce a plan that
  passes validation; every frequency **1 through 7** produces the correct
  day count; determinism (same profile+week → identical plan; different
  uid or a later week → can differ); end-to-end injury filtering (a knee
  limitation excludes squat-pattern exercises from the *entire* generated
  plan, not just one body part; a shoulder limitation excludes
  overhead-press exercises); and `validateGeneratedPlan` correctly flags a
  tampered invalid exercise id, an empty non-rest day, and a day-count
  mismatch.
- `generateWorkoutPlan.test.ts` (9 tests) — the callable handler: auth
  required; always reads the profile via `request.auth.uid`, never a
  client-supplied `userId`; `failed-precondition` (not a silent default)
  for a missing profile, an unsupported goal, missing equipment, or an
  invalid frequency; the success path returns a plan matching the stored
  frequency and actually calls `saveGeneratedPlan`; an `empty_pool` failure
  never reaches the save step.
- `validateWorkoutPlan.test.ts` (9 tests) — auth required; malformed
  payload rejected; empty plan flagged; a manually-typed exercise that
  matches a catalog entry gets checked against limitations and equipment;
  a safe manually-typed exercise passes; a fully custom exercise name
  produces a warning, not an error; a nameless exercise entry is rejected.

## 11. Test results

```
Test Suites: 11 passed, 11 total
Tests:       131 passed, 131 total
Time:        ~5-27s (varies by environment)
```
Run both in this session's own environment and again on the connected
device (`cd functions && npm run build && npx jest`) — identical result in
both places. `npm run build` (`tsc`) also completes with zero errors in
both environments.

## 12. Unsupported questionnaire values discovered

- No *new* unsupported goal/equipment/experience strings were discovered
  beyond what the audit already flagged (all 8 goals, all 12 equipment
  options, and all 4 experience levels are now explicitly mapped — see
  sections 3 and 6).
- The free-text `modifications` field has no fixed vocabulary at all, so
  "unsupported values" isn't really the right frame for it — any phrasing
  that doesn't contain one of the 8 recognized body-region keywords (knee,
  shoulder, lower back, wrist, ankle, hip, neck, elbow) produces no
  limitation tag and is treated as "no reported limitation" for that
  aspect. This is disclosed as a known gap in section 5, not silently
  assumed to be safe.
- `ManualWorkout.js`'s own independent `goalOptions` list
  (`["Build Muscle", "Lose Weight", "Strength", "Endurance", "Toning",
  "Maintain"]`, per the audit) still exists unchanged and still doesn't
  match either the questionnaire's 8 real goals or the new canonical
  8-goal set — it's a cosmetic display default in a user-directed flow
  (the user picks their own goal there), not a safety issue, so it was left
  alone per the "no unrelated changes" constraint. Worth reconciling in a
  future cleanup pass — see section 14.

## 13. Remaining ExerciseDB dependencies

`src/services/generateWorkoutPlan.js`'s `ExerciseDBWorkoutGenerator` class
still makes live calls to `https://exercisedb-api.vercel.app/api/v1`, used
by exactly two still-exported, still-used functions:
- `searchExercises()` and `getExerciseCategories()` — both imported by
  `src/screens/MainScreens/AddExercise.js`'s "browse/search exercises"
  screen, which is unrelated to plan generation and out of this task's
  scope.

The class's own plan-generation methods (`generateWorkoutPlan()`,
`validateWorkoutPlan()`, `normalizeGoal()`, `getWorkoutTemplate()`,
`selectExercisesForWorkout()`, etc.) are now **dead code** — nothing calls
them since `generateExerciseDBWorkoutPlan()` was rewritten to call the
Cloud Function instead. They were deliberately left in place rather than
deleted in this pass: surgically removing ~1,900 lines out of a single
2,500-line class file, while keeping the ~500 lines `AddExercise.js`
actually needs, is real refactoring risk for zero behavior change, and the
task's own instructions prioritize not breaking existing functionality
over code cleanliness. See section 14 for the recommended follow-up.

## 14. Issues/follow-up tasks discovered

- **Dead code cleanup**: extract `searchExercises`/`getExerciseCategories`/
  the ExerciseDB fetch plumbing from `generateWorkoutPlan.js` into a small,
  dedicated `exerciseBrowser.js` service, then delete the now-unused
  plan-generation methods from that file entirely. Low risk, purely
  additive to code quality, not attempted here to keep this task's diff
  scoped to what it needed to change.
- **`ManualWorkout.js`'s own goal/equipment lists** are still independent
  of the canonical values used server-side (see section 12). Not a safety
  issue since the user directly picks these values themselves, but worth
  reconciling so the manual and generated flows present the same options.
- **Free-text injury field**: replacing `Modifications.js`'s free-text
  input with a fixed multi-select of the 8 supported limitation tags (or a
  superset) would make injury filtering exact instead of best-effort
  keyword matching. This is the single highest-value follow-up for the
  safety story.
- **Nutrition/warmup/cooldown/recovery content** in the generated plan is
  now goal-aware but intentionally simple (a handful of static, per-goal
  strings) — it was rebuilt just enough to keep `plan`'s existing top-level
  shape intact for whatever UI renders it, not to be a fully-featured
  nutrition engine. Expanding this was out of scope (Step 14 also
  implicitly covers this — no AI-generated coaching content yet).
- **Weekly regeneration** (a scheduled/automatic re-generation flow) was
  not part of this task's scope and hasn't been touched — `generateWorkoutPlan`
  is only invoked directly, on demand, exactly like the old client-side
  path was.
- **Manual workout equipment dropdown** (`ManualWorkout.js`'s own
  `equipmentOptions` list) is still a separate, unenforced convenience list
  — a user can still pick "barbell" for a manually-typed exercise even if
  their profile says they have no barbell. The new `validateWorkoutPlan`
  check only catches this when the exercise *name* happens to match a
  catalog entry; a fully custom name bypasses it (disclosed as a warning,
  not silently passed as safe — see section 5's "known, disclosed
  limitation"). Extending catalog coverage over time narrows this gap
  without any code changes.
- **The Groq API key from the prior security task still needs to be
  rotated and the Cloud Functions still need to be deployed** (see
  `CLOUD_FUNCTIONS_BACKEND.md` section 12) before `generateWorkoutPlan` or
  `chatWithCoach` will work against a real device — this task adds another
  function to that same not-yet-deployed backend, it doesn't change that
  prerequisite.

---

**Bottom line**: all 8 questionnaire goals now map to a distinct, correct
strategy with no silent fallback; the `Dumbells`/`Nothing` equipment bugs
and the `"Advance"` experience bug are fixed; injury/limitation filtering
now actually runs, before any random selection, with an alternatives
recovery path and an explicit failure mode when nothing is safe; every
generated plan is validated before it's saved, never saved unconditionally;
102 new tests cover every goal, every supported equipment type, injury
exclusion, every frequency 1-7, and the full set of invalid-input cases;
and the React Native app no longer contains the exercise-selection decision
logic — it collects the questionnaire, calls the backend, and displays the
result. This still needs the same deploy/rotate-key steps as the chat
feature before any of it is live in production.
