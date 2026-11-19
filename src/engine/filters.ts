// Hard filters (plan section 3, order 1-2). An exercise the client cannot safely
// or physically do never reaches scoring.
import type { ClientModel, Exercise, Rule, StressValue } from "./types.ts";
import { rulesForInjury } from "./catalogue.ts";

export interface FilterFail { filter: string; detail: string }

export function passesHardFilters(
  exercise: Exercise,
  client: ClientModel,
  rules: Rule[],
): FilterFail[] {
  const fails: FilterFail[] = [];
  const owned = new Set(client.env.equipment);
  const missing = exercise.equipment.filter((eq) => !owned.has(eq));
  if (missing.length > 0) fails.push({ filter: "equipment", detail: missing.join(",") });

  if (exercise.constraints.jumping && client.prefs.noJump) {
    fails.push({ filter: "noise", detail: "jumping not allowed" });
  }
  if (exercise.constraints.noise && client.prefs.noJump) {
    fails.push({ filter: "noise", detail: "noisy exercise in apartment" });
  }
  const space = client.prefs.spaceM2;
  if (exercise.constraints.spaceM2 && space && exercise.constraints.spaceM2 > space) {
    fails.push({ filter: "space", detail: `needs ${exercise.constraints.spaceM2} m2` });
  }
  const cap = client.level === "beginner" ? 2 : 3;
  if (exercise.complexity > cap) {
    fails.push({ filter: "complexity", detail: `${exercise.complexity} > cap ${cap}` });
  }
  for (const injury of client.injuries) {
    if (injury.status === "cleared" || injury.clearedAt) continue;
    for (const rule of rulesForInjury(injury, rules)) {
      const violation = violatesRule(exercise, rule);
      if (violation) fails.push({ filter: "injury-rule", detail: violation });
    }
  }
  return fails;
}

/** Injury rules map conditions to stress limits, not banned exercise names. */
export function violatesRule(exercise: Exercise, rule: Rule): string | null {
  for (const [region, limits] of Object.entries(rule.limits) as [string, Partial<StressValue>][]) {
    const stress = exercise.stress[region as keyof typeof exercise.stress];
    if (!stress) continue;
    for (const axis of ["load", "range", "impact"] as const) {
      const max = limits[axis];
      if (max !== undefined && stress[axis] > max) {
        return `${rule.id}: ${region} ${axis} ${stress[axis]} > ${max}`;
      }
    }
  }
  return null;
}
