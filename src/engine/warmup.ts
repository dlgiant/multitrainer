// Warm-up, primers, ramp-up sets, cool-down (plan section 5).
import type { ClientModel, Pattern, PlannedExercise } from "./types.ts";
import { R } from "./reasons.ts";

const PRIMER_BY_PATTERN: Partial<Record<Pattern, string>> = {
  squat: "glute-bridge", lunge: "glute-bridge", hinge: "glute-bridge",
  "h-push": "band-row", "v-push": "band-row", "h-pull": "band-row", "v-pull": "band-row",
};

export function warmupFor(sessionPatterns: Pattern[], client: ClientModel, raiser: string): PlannedExercise[] {
  const items: PlannedExercise[] = [];
  items.push({
    exerciseId: raiser, block: "warmup", sets: 1, targetReps: 60, targetRir: 4,
    restMin: 0, reason: { id: R.WarmupPattern, params: { note: client.prefs.noJump ? "no-jump rule" : "pulse raiser" } },
  });
  const primer = PRIMER_BY_PATTERN[sessionPatterns[0] ?? "squat"] ?? "glute-bridge";
  items.push({
    exerciseId: primer, block: "primer", sets: 2, targetReps: 12, targetRir: 4,
    restMin: 0.5, reason: { id: R.InjuryPrimer, params: { pattern: sessionPatterns[0] ?? "" } },
  });
  return items;
}

export function rampUpSets(loadKg: number | undefined, weights: number[]): PlannedExercise[] {
  if (loadKg === undefined) return []; // bodyweight: no ramp-up needed
  const lightest = Math.min(...weights);
  if (loadKg <= lightest) {
    return []; // skipped: working load is the lightest weight they own
  }
  const at = (pct: number): number => {
    const target = loadKg * pct;
    return Math.max(lightest, [...weights].sort((a, b) => b - a).find((w) => w <= target) ?? lightest);
  };
  return [
    { exerciseId: "ramp-up", block: "warmup", sets: 1, targetReps: 8, targetRir: 4, loadKg: at(0.4), restMin: 1, reason: { id: R.RampUp, params: { pct: 40 } } },
    { exerciseId: "ramp-up", block: "warmup", sets: 1, targetReps: 5, targetRir: 4, loadKg: at(0.6), restMin: 1, reason: { id: R.RampUp, params: { pct: 60 } } },
    { exerciseId: "ramp-up", block: "warmup", sets: 1, targetReps: 3, targetRir: 4, loadKg: at(0.8), restMin: 1, reason: { id: R.RampUp, params: { pct: 80 } } },
  ];
}

export function cooldownFor(stretches: string[]): PlannedExercise[] {
  return stretches.map((id) => ({
    exerciseId: id, block: "cooldown" as const, sets: 2, targetReps: 30, targetRir: 4,
    restMin: 0, reason: { id: R.CooldownFirst },
  }));
}
