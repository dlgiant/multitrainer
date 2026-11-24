// e1RM (Epley with RIR), load seeding, calibration fallback, test battery and
// retest comparison (plan sections 7-8, marco 3 restante).
import type { Benchmarks, BodyRegion, ClientModel, Exercise, Pattern, Rule } from "./types.ts";
import { passesHardFilters } from "./filters.ts";
import { RULES } from "./catalogue.ts";

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

// ---------- test battery (marco 3: bateria de benchmarks) ----------

export interface BatterySuggestion {
  exerciseId: string;
  targetReps: number;            // 5-10: valid Epley+RIR range
}

// Pattern coverage order for the battery: big compounds first.
const BATTERY_PATTERN_ORDER: Pattern[] = ["squat", "hinge", "h-push", "v-push", "h-pull", "v-pull", "lunge", "carry", "core", "conditioning", "mobility"];
const BATTERY_ROLE_RANK: Record<string, number> = { main: 0, accessory: 1, primer: 2, core: 3 };

/** Suggests which loadable exercises to rep-test for this client: owned
 *  equipment, within the level complexity cap, passing the injury hard
 *  filters, main-role and compound patterns first. Deterministic. */
export function batteryFor(
  client: ClientModel,
  catalogue: Exercise[],
  opts: { rules?: Rule[]; limit?: number } = {},
): BatterySuggestion[] {
  const rules = opts.rules ?? RULES;
  const limit = opts.limit ?? 4;
  const cap = client.level === "beginner" ? 2 : 3;
  const owned = new Set(client.env.equipment);
  const rank = (p: Pattern) => {
    const i = BATTERY_PATTERN_ORDER.indexOf(p);
    return i === -1 ? BATTERY_PATTERN_ORDER.length : i;
  };
  return catalogue
    .filter((ex) =>
      ex.loadable &&
      ex.complexity <= cap &&
      ex.equipment.every((eq) => owned.has(eq)) &&
      passesHardFilters(ex, client, rules).length === 0,
    )
    .sort((a, b) =>
      (BATTERY_ROLE_RANK[a.role] ?? 9) - (BATTERY_ROLE_RANK[b.role] ?? 9) ||
      rank(a.pattern) - rank(b.pattern) ||
      a.complexity - b.complexity ||
      a.id.localeCompare(b.id),
    )
    .slice(0, limit)
    .map((ex) => ({ exerciseId: ex.id, targetReps: ex.pattern === "hinge" ? 10 : 8 }));
}

// ---------- retest comparison (marco 3: visão de reteste) ----------

export interface BenchmarkDelta {
  exerciseId: string;
  beforeE1rm: number;
  afterE1rm: number;
  deltaKg: number;
  deltaPct: number;              // 0 when before is 0
}

export interface BenchmarksComparison {
  tests: BenchmarkDelta[];       // only tests present in both assessments
  newTests: string[];            // tested only in `after`
  pain: { region: BodyRegion; before: number; after: number; delta: number }[];
  improved: number;              // count of tests with deltaPct > 0
  declined: number;              // count of tests with deltaPct < 0
}

/** Compares two assessments (oldest -> newest): e1rm evolution per rep test
 *  plus pain scores per region. Pure. */
export function compareBenchmarks(before: Benchmarks | undefined, after: Benchmarks | undefined): BenchmarksComparison {
  const beforeTests = before?.repTests ?? [];
  const afterTests = after?.repTests ?? [];
  const tests: BenchmarkDelta[] = [];
  const newTests: string[] = [];
  for (const t of afterTests) {
    const b = beforeTests.find((x) => x.exerciseId === t.exerciseId);
    if (!b) {
      newTests.push(t.exerciseId);
      continue;
    }
    const beforeE1rm = e1rm(b.loadKg, b.reps, b.rir);
    const afterE1rm = e1rm(t.loadKg, t.reps, t.rir);
    tests.push({
      exerciseId: t.exerciseId,
      beforeE1rm,
      afterE1rm,
      deltaKg: afterE1rm - beforeE1rm,
      deltaPct: beforeE1rm > 0 ? (afterE1rm - beforeE1rm) / beforeE1rm : 0,
    });
  }
  const pain: BenchmarksComparison["pain"] = [];
  for (const p of after?.pain ?? []) {
    const b = (before?.pain ?? []).find((x) => x.region === p.region);
    pain.push({ region: p.region, before: b?.score ?? 0, after: p.score, delta: p.score - (b?.score ?? 0) });
  }
  return {
    tests,
    newTests,
    pain,
    improved: tests.filter((t) => t.deltaPct > 0).length,
    declined: tests.filter((t) => t.deltaPct < 0).length,
  };
}
