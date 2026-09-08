import { resolveEquipment, equipmentIsAvailable } from "../constants/equipment";
import { WorkoutEngineError } from "../utils/workoutErrors";

describe("resolveEquipment", () => {
  it('fixes the "Dumbells" (single b, the real questionnaire string) typo', () => {
    expect(resolveEquipment(["Dumbells"])).toEqual(["dumbbell"]);
  });

  it("also accepts the correctly-spelled Dumbbells defensively", () => {
    expect(resolveEquipment(["Dumbbells"])).toEqual(["dumbbell"]);
  });

  it('resolves "Nothing" to bodyweight-only, not to "no restriction"', () => {
    const result = resolveEquipment(["Nothing"]);
    expect(result).toEqual(["bodyweight"]);
  });

  it('resolves "Everything" to the full_gym wildcard', () => {
    expect(resolveEquipment(["Everything"])).toEqual(["full_gym"]);
  });

  it.each([
    ["Cable machine", "cable"],
    ["Smith machine", "smith_machine"],
    ["Barbell", "barbell"],
    ["Back machines", "machine"],
    ["Leg machines", "machine"],
    ["Pull up/Dip bars", "pull_up_dip_bars"],
  ])("resolves %s to canonical %s", (raw, expected) => {
    expect(resolveEquipment([raw])).toEqual([expected]);
  });

  it("de-duplicates and combines multiple selections", () => {
    const result = resolveEquipment(["Dumbells", "Barbell", "Back machines", "Leg machines"]);
    expect(result.sort()).toEqual(["barbell", "dumbbell", "machine"].sort());
  });

  it('normalizes an equipment-inert selection (e.g. only "Other") to a safe bodyweight default rather than "full gym"', () => {
    expect(resolveEquipment(["Other"])).toEqual(["bodyweight"]);
  });

  it("throws on missing/empty equipment data rather than silently assuming full gym", () => {
    expect(() => resolveEquipment(undefined)).toThrow(WorkoutEngineError);
    expect(() => resolveEquipment([])).toThrow(WorkoutEngineError);
    try {
      resolveEquipment(null);
      fail("expected resolveEquipment to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(WorkoutEngineError);
      expect((err as WorkoutEngineError).category).toBe("invalid_equipment");
    }
  });
});

describe("equipmentIsAvailable", () => {
  it("full_gym matches any required equipment", () => {
    expect(equipmentIsAvailable("barbell", ["full_gym"])).toBe(true);
    expect(equipmentIsAvailable("machine", ["full_gym"])).toBe(true);
  });

  it("only matches equipment the user actually has otherwise", () => {
    expect(equipmentIsAvailable("barbell", ["dumbbell"])).toBe(false);
    expect(equipmentIsAvailable("dumbbell", ["dumbbell", "cable"])).toBe(true);
  });
});
