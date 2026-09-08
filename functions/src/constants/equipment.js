"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEquipment = resolveEquipment;
exports.equipmentIsAvailable = equipmentIsAvailable;
const v2_1 = require("firebase-functions/v2");
const workoutErrors_1 = require("../utils/workoutErrors");
/**
 * Canonical equipment resolution. Fixes the two equipment bugs the audit
 * found in `src/services/generateWorkoutPlan.js`:
 *
 *  1. The questionnaire's real option string is `"Dumbells"` (single b —
 *     see `src/screens/Questionnaire/AvailableEquipment.js`), but the old
 *     generator's substring check only recognized `"dumbbell"` (double b),
 *     so selecting it silently added no equipment filter at all.
 *  2. Selecting `"Nothing"` (the explicit "I have no equipment" option) also
 *     produced zero filter entries, which the old code then treated as "no
 *     restriction" (any exercise passes) — the opposite of what a user who
 *     says they have no equipment should get.
 *
 * Every raw string below is mapped explicitly and case-insensitively. A
 * value that resolves to nothing recognizable is normalized to a safe
 * bodyweight-only default and logged (Step 9's "normalize -> continue" for
 * recoverable cases) rather than silently treated as "full gym."
 */
const RAW_EQUIPMENT_MAP = {
    everything: ["full_gym"],
    "full gym": ["full_gym"], // legacy/default fallback value, not a real questionnaire option
    nothing: ["bodyweight"],
    bodyweight: ["bodyweight"],
    "body weight": ["bodyweight"],
    "no equipment": ["bodyweight"],
    "cable machine": ["cable"],
    "smith machine": ["smith_machine"],
    "squat rack": ["barbell"], // a squat rack implies barbell squat capability
    "back extension": [], // recognized selection, but maps to no additional catalog equipment tag
    dumbells: ["dumbbell"], // the questionnaire's actual (misspelled) option string
    dumbbells: ["dumbbell"], // correct spelling, accepted defensively
    dumbbell: ["dumbbell"],
    barbell: ["barbell"],
    "pull up/dip bars": ["pull_up_dip_bars"],
    "pull up / dip bars": ["pull_up_dip_bars"],
    "back machines": ["machine"],
    "leg machines": ["machine"],
    machine: ["machine"],
    machines: ["machine"],
    cable: ["cable"],
    band: ["band"],
    "resistance band": ["band"],
    other: [], // recognized, but conveys no specific equipment capability
};
/**
 * Resolves a raw `availableEquipment` value (expected: string[] from
 * `AvailableEquipment.js`'s multi-select, but tolerates a bare string for
 * older/legacy data) into a canonical, de-duplicated `Equipment[]`.
 *
 * Missing/empty equipment data is treated as an explicit error (Step 9) —
 * never silently assumed to mean "full gym," since that would let a plan
 * include equipment the user may not actually have.
 */
function resolveEquipment(raw) {
    const values = Array.isArray(raw)
        ? raw.map((v) => String(v))
        : typeof raw === "string" && raw.trim().length > 0
            ? [raw]
            : [];
    if (values.length === 0) {
        throw new workoutErrors_1.WorkoutEngineError("invalid_equipment", "No equipment selection found on the user's profile.");
    }
    const resolved = new Set();
    const unrecognized = [];
    for (const value of values) {
        const key = value.toLowerCase().trim();
        const mapped = RAW_EQUIPMENT_MAP[key];
        if (mapped === undefined) {
            unrecognized.push(value);
            continue;
        }
        mapped.forEach((tag) => resolved.add(tag));
    }
    if (unrecognized.length > 0) {
        // A genuinely unrecognized string (not one of the known options at all,
        // e.g. future questionnaire values this engine hasn't been updated for
        // yet). Log it for observability rather than silently dropping it.
        v2_1.logger.warn("equipment.unrecognized_value", { values: unrecognized });
    }
    if (resolved.size === 0) {
        // Every provided value was recognized but equipment-inert (e.g. only
        // "Other"/"Back extension" were selected), or every value was
        // unrecognized. Normalize to the safest possible default rather than
        // "full gym" — see module docstring.
        v2_1.logger.info("equipment.normalized_to_bodyweight", { rawValues: values });
        resolved.add("bodyweight");
    }
    return Array.from(resolved);
}
/**
 * True if an exercise requiring `required` is usable given the user's
 * resolved `available` equipment set. `full_gym` and `bodyweight` are
 * wildcards handled specially: `full_gym` means "anything is available";
 * every exercise (regardless of its own equipment tag) is always at least
 * matched by the user having that exact tag, or by `bodyweight` when the
 * exercise itself is a bodyweight movement.
 */
function equipmentIsAvailable(required, available) {
    if (available.includes("full_gym")) {
        return true;
    }
    return available.includes(required);
}
//# sourceMappingURL=equipment.js.map