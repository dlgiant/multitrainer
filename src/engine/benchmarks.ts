// e1RM (Epley with RIR), load seeding, calibration fallback (plan sections 7-8).
import type { Benchmarks, ClientModel, Exercise } from "./types.ts";

/** e1RM = load x (1 + (reps + RIR)/30). Valid up to ~10 reps + RIR. */
export function e1rm(loadKg: number, reps: number, rir: number): number {
  return loadKg * (1 + (reps + rir) / 30);
}

/** Related-lift ratios for lifts without a test (plan section 8). */
export const RATIO: Record<string, { from: string; factor: number }> = {
  "db-bench-press": { from: "db-row", factor: 0.8 },
};

export function roundDownToOwned(loadKg: number, weights: number[]): number {
  const sorted = [...weights].sort((a, b) => a - b);
  const usable = sorted.filter((w) => w <= loadKg);
  return usable.length > 0 ? usable[usable.length - 1]! : sorted[0] ?? loadKg;
}

/** % of e1RM for target reps + RIR, from the Epley formula inverse. */
export function pctForReps(reps: number, rir: number): number {
  return 1 / (1 + (reps + rir) / 30);
}

export function seedLoad(
  exercise: Exercise,
  targetReps: number,
  targetRir: number,
  client: ClientModel,
): number | undefined {
  if (!exercise.loadable) return undefined;
  const bench: Benchmarks = client.benchmarks ?? {};
  const tests = bench.repTests ?? [];
  const direct = tests.find((t) => t.exerciseId === exercise.id);
  const ratio = RATIO[exercise.id];
  const related = ratio ? tests.find((t) => t.exerciseId === ratio.from) : undefined;
  const test = direct ?? (related
    ? { exerciseId: exercise.id, reps: related.reps, loadKg: related.loadKg * ratio.factor, rir: related.rir }
    : undefined);
  if (!test) return undefined; // session 1 = calibration, trainer starts light
  const e = e1rm(test.loadKg, test.reps, test.rir);
  return roundDownToOwned(e * pctForReps(targetReps, targetRir), client.env.weightsKg);
}
