import { getCatalogByBodyPart, getCatalogById } from "../data/exerciseCatalog";
import { equipmentIsAvailable } from "../constants/equipment";
import { GoalStrategy } from "../constants/goals";
import { BodyPart, CatalogExercise, NormalizedProfile, PlanExercise } from "../types/workout";
import { seededShuffle } from "../utils/seededRandom";
import { WorkoutEngineError } from "../utils/workoutErrors";

/**
 * The correct order from Step 7:
 *   catalog for body part -> equipment filter -> experience filter ->
 *   injury/limitation filter -> approved pool -> controlled (seeded) random
 *   selection.
 * Never: pick randomly first and check safety after. Every filter below runs
 * before `seededShuffle` is ever called.
 */

/**
 * These three predicates are exported (not just used internally) so that
 * `utils/planValidation.ts` can re-check an already-assembled plan against
 * the exact same equipment/experience/limitation rules used at selection
 * time, instead of re-implementing a second, potentially-drifting copy of
 * "is this exercise safe for this profile."
 */
export function passesEquipment(exercise: CatalogExercise, profile: NormalizedProfile): boolean {
  return equipmentIsAvailable(exercise.equipment, profile.equipment);
}

export function passesExperience(exercise: CatalogExercise, profile: NormalizedProfile, strategy: GoalStrategy): boolean {
  // Plyometric/explosive movements are only ever offered to non-beginners,
  // and only when the goal's strategy allows them at all (Step 4/7 safety
  // gate — this is enforced here in the engine, not left for an AI layer to
  // decide later, per Step 14).
  if (exercise.movementType === "plyometric") {
    if (profile.experience === "beginner") return false;
    if (!strategy.allowsPlyometric) return false;
  }

  if (profile.experience === "beginner") return exercise.difficulty === "beginner";
  if (profile.experience === "intermediate") return exercise.difficulty !== "advanced";
  return true; // advanced users can do any difficulty tier
}

export function passesLimitations(exercise: CatalogExercise, profile: NormalizedProfile): boolean {
  if (profile.limitations.length === 0) return true;
  return !exercise.contraindications.some((tag) => profile.limitations.includes(tag));
}

/**
 * Builds the safe, eligible pool for one body part: catalog -> equipment ->
 * experience -> limitations, with an alternatives-based recovery pass if the
 * limitation filter alone would otherwise leave the pool empty (Step 4's
 * "support approved alternatives").
 */
export function buildSafePool(bodyPart: BodyPart, profile: NormalizedProfile, strategy: GoalStrategy): CatalogExercise[] {
  const catalogForBodyPart = getCatalogByBodyPart(bodyPart);
  const equipmentAndExperienceOk = catalogForBodyPart.filter(
    (ex) => passesEquipment(ex, profile) && passesExperience(ex, profile, strategy)
  );

  const safe = equipmentAndExperienceOk.filter((ex) => passesLimitations(ex, profile));
  if (safe.length > 0) {
    return safe;
  }

  // Every equipment/experience-eligible exercise for this body part is
  // contraindicated. Try each excluded exercise's approved alternatives —
  // an alternative is only used if it independently passes every filter.
  const excluded = equipmentAndExperienceOk.filter((ex) => !passesLimitations(ex, profile));
  const alternativeIds = new Set<string>();
  excluded.forEach((ex) => ex.alternatives.forEach((id) => alternativeIds.add(id)));

  const recovered: CatalogExercise[] = [];
  alternativeIds.forEach((id) => {
    const candidate = getCatalogById(id);
    if (
      candidate &&
      candidate.bodyPart === bodyPart &&
      passesEquipment(candidate, profile) &&
      passesExperience(candidate, profile, strategy) &&
      passesLimitations(candidate, profile)
    ) {
      recovered.push(candidate);
    }
  });

  return recovered;
}

/**
 * Picks `count` exercises for one body-part slot from an already-safe pool,
 * using the supplied deterministic `rng` (never `Math.random()` — see
 * `utils/seededRandom.ts`). Exercises already used elsewhere in the week
 * (`usedIds`) are deprioritized (Step 10: "avoid selecting the same
 * exercise repeatedly when alternatives are available") but not banned
 * outright — if the safe pool is smaller than `count`, repeats are allowed
 * rather than producing an incomplete workout.
 */
export function pickFromPool(
  pool: CatalogExercise[],
  count: number,
  rng: () => number,
  usedIds: Set<string>
): CatalogExercise[] {
  if (pool.length === 0) {
    return [];
  }
  const shuffled = seededShuffle(pool, rng);
  const unused = shuffled.filter((ex) => !usedIds.has(ex.id));
  const used = shuffled.filter((ex) => usedIds.has(ex.id));
  const prioritized = [...unused, ...used];

  const picked: CatalogExercise[] = [];
  for (let i = 0; i < count; i++) {
    // Cycle through the prioritized pool if `count` exceeds the pool size,
    // rather than returning fewer exercises than the template calls for.
    picked.push(prioritized[i % prioritized.length]);
  }
  picked.forEach((ex) => usedIds.add(ex.id));
  return picked;
}

export function toPlanExercise(
  exercise: CatalogExercise,
  strategy: GoalStrategy,
  experience: NormalizedProfile["experience"]
): PlanExercise {
  const [min, max] = strategy.reps[experience];
  return {
    id: exercise.id,
    name: exercise.name,
    bodyPart: exercise.bodyPart,
    equipment: exercise.equipment,
    sets: strategy.sets[experience],
    reps: min === max ? `${min}` : `${min}-${max}`,
    restSeconds: strategy.restSeconds,
  };
}

/**
 * Full pipeline for one body part: safe pool -> controlled selection ->
 * plan-shaped exercises. Throws `empty_pool` (Step 9: explicit, observable
 * rejection) if literally nothing is safe/available for this body part —
 * this deliberately does NOT fall back to an unsafe exercise or an empty
 * day (Step 8 forbids empty workout days).
 */
export function selectExercisesForBodyPart(
  bodyPart: BodyPart,
  count: number,
  profile: NormalizedProfile,
  strategy: GoalStrategy,
  rng: () => number,
  usedIds: Set<string>
): PlanExercise[] {
  const pool = buildSafePool(bodyPart, profile, strategy);
  if (pool.length === 0) {
    throw new WorkoutEngineError(
      "empty_pool",
      `No safe exercises available for body part "${bodyPart}" given equipment=${JSON.stringify(
        profile.equipment
      )} experience=${profile.experience} limitations=${JSON.stringify(profile.limitations)}`
    );
  }
  const picked = pickFromPool(pool, count, rng, usedIds);
  return picked.map((ex) => toPlanExercise(ex, strategy, profile.experience));
}
