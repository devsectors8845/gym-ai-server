/**
 * Parses the height/weight string formats the questionnaire actually writes
 * today (e.g. `"180cm"`, `"70kg"`, `"154LB"` — see
 * `src/screens/Questionnaire/{HeightQuestionnaire,AgeQuestionnaire}.js`).
 * These are display/cosmetic values only (used in `plan.userProfile` for
 * showing the user their stats back, and in nutrition guidance) — they do
 * not affect goal/equipment/safety logic, so unlike goal/equipment/frequency
 * they degrade to a documented default rather than failing generation
 * outright when unparseable, consistent with how the old generator treated
 * them (`parseWeight`/`parseHeight` in the original `generateWorkoutPlan.js`
 * also silently clamped to a default rather than erroring).
 */
const DEFAULT_HEIGHT_CM = 175;
const DEFAULT_WEIGHT_KG = 70;

export function parseHeightCm(raw: unknown): number {
  const str = String(raw ?? "").toLowerCase().trim();
  const match = str.match(/(\d+(\.\d+)?)/);
  if (!match) return DEFAULT_HEIGHT_CM;
  const value = parseFloat(match[1]);
  if (str.includes("ft") || str.includes("'")) {
    // e.g. "5'10" — best-effort feet/inches parse.
    const feetInches = str.match(/(\d+)\s*'?\s*(ft)?\s*(\d+)?/);
    const feet = feetInches ? parseInt(feetInches[1], 10) : value;
    const inches = feetInches && feetInches[3] ? parseInt(feetInches[3], 10) : 0;
    const cm = feet * 30.48 + inches * 2.54;
    return cm >= 100 && cm <= 250 ? cm : DEFAULT_HEIGHT_CM;
  }
  // Assume cm (the app's actual stored format); guard against obviously
  // implausible values (e.g. a raw meters value like "1.8").
  if (value > 0 && value < 3) {
    const cm = value * 100;
    return cm >= 100 && cm <= 250 ? cm : DEFAULT_HEIGHT_CM;
  }
  return value >= 100 && value <= 250 ? value : DEFAULT_HEIGHT_CM;
}

export function parseWeightKg(raw: unknown): number {
  const str = String(raw ?? "").toLowerCase().trim();
  const match = str.match(/(\d+(\.\d+)?)/);
  if (!match) return DEFAULT_WEIGHT_KG;
  const value = parseFloat(match[1]);
  if (str.includes("lb")) {
    const kg = value * 0.453592;
    return kg >= 30 && kg <= 250 ? kg : DEFAULT_WEIGHT_KG;
  }
  return value >= 30 && value <= 250 ? value : DEFAULT_WEIGHT_KG;
}
