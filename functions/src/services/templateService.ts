import { BodyPart, Goal } from "../types/workout";
import { getGoalStrategy } from "../constants/goals";
import { WorkoutEngineError } from "../utils/workoutErrors";

export interface WeeklySplitDay {
  dayLabel: string;
  bodyParts: BodyPart[];
}

const DAY_ARCHETYPES: Record<string, BodyPart[]> = {
  Push: ["chest", "shoulders", "arms"],
  Pull: ["back", "arms"],
  Legs: ["legs", "core"],
  "Upper Body": ["chest", "back", "shoulders", "arms"],
  "Lower Body": ["legs", "core"],
  "Full Body": ["chest", "back", "legs", "core"],
  Cardio: ["cardio"],
  Rest: [],
};

/**
 * One base split per supported frequency (1-7 days/week). Goal-specific
 * cardio allocation (`GoalStrategy.cardioDaysForFrequency`) is applied on
 * top of this base, deterministically (see `buildWeeklySplit` below) — the
 * base structure itself does not depend on goal, only on day count, which
 * keeps the split table small and predictable (Step 10).
 */
const BASE_SPLITS: Record<number, string[]> = {
  1: ["Full Body"],
  2: ["Upper Body", "Lower Body"],
  3: ["Push", "Pull", "Legs"],
  4: ["Push", "Pull", "Legs", "Upper Body"],
  5: ["Push", "Pull", "Legs", "Upper Body", "Lower Body"],
  6: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"],
  7: ["Push", "Pull", "Legs", "Upper Body", "Lower Body", "Full Body", "Rest"],
};

/**
 * Builds the week's day-by-day structure for a goal + frequency. This is the
 * template-selection step (Step 7's "Workout Template", ahead of any
 * exercise-level filtering/selection). Purely deterministic — no randomness
 * here, only in which specific exercises later fill each body part slot.
 */
export function buildWeeklySplit(goal: Goal, days: number): WeeklySplitDay[] {
  const base = BASE_SPLITS[days];
  if (!base) {
    // Defensive: profileService.normalizeProfile already rejects days
    // outside 1-7 as `invalid_frequency`, so reaching here would be an
    // engine bug, not a user-input problem — fail loudly rather than
    // silently defaulting to a 3-day split as the old code did.
    throw new WorkoutEngineError("invalid_frequency", `No split defined for ${days} days/week.`);
  }

  const strategy = getGoalStrategy(goal);
  const nonRestCount = base.filter((label) => label !== "Rest").length;
  // Keep at least one non-cardio day when there's more than one training
  // day, and never turn a single-day-per-week plan entirely into cardio —
  // a lone weekly session should still include resistance work.
  const maxCardioDays = days === 1 ? 0 : Math.max(0, nonRestCount - 1);
  const cardioDays = Math.min(strategy.cardioDaysForFrequency(days), maxCardioDays);

  const result = base.map((label) => ({ dayLabel: label, bodyParts: DAY_ARCHETYPES[label] }));

  if (cardioDays > 0) {
    // Deterministically convert the LAST `cardioDays` non-"Rest" days into
    // cardio days, working backward from the end of the week.
    let converted = 0;
    for (let i = result.length - 1; i >= 0 && converted < cardioDays; i--) {
      if (result[i].dayLabel === "Rest") continue;
      result[i] = { dayLabel: "Cardio", bodyParts: DAY_ARCHETYPES.Cardio };
      converted++;
    }
  }

  return result;
}
