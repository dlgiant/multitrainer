// Per-session autoregulation (plan section 7). Pure: reads history, returns a
// diff proposal. The trainer accepts all, some or none.
import type { Change, SessionLog, PlannedExercise, ClientModel } from "./types.ts";
import { R } from "./reasons.ts";
import { e1rm, roundDownToOwned } from "./benchmarks.ts";

const nextWeight = (loadKg: number, weights: number[]): number | undefined => {
  const sorted = [...weights].sort((a, b) => a - b);
  return sorted.find((w) => w > loadKg);
};

export function progressExercise(
  planned: PlannedExercise,
  history: SessionLog[],
  client: ClientModel,
): Change[] {
  const logs = history.flatMap((s) => s.sets.filter((st) => st.exerciseId === planned.exerciseId));
  if (logs.length === 0) return [];
  const last = logs.slice(-planned.sets);
  const topOfRange = planned.targetReps;
  const bottomOfRange = Math.max(3, Math.round(topOfRange * 0.66));
  const maxReps = Math.max(...last.map((s) => s.reps));
  const worstRir = Math.min(...last.map((s) => s.rir));
  const pain = last.find((s) => (s.pain?.score ?? 0) >= 4);

  // Pain flag: regress one step next session, show the trainer the flag.
  if (pain) {
    const ex = pain as { exerciseId: string };
    return [{ kind: "regress", exerciseId: planned.exerciseId, to: ex.exerciseId, reason: { id: R.PainFlag, params: { region: pain.pain?.region ?? "unknown", score: pain.pain?.score ?? 0 } } }];
  }

  const isBodyweight = planned.loadKg === undefined;
  const allHitTop = last.every((s) => s.reps >= topOfRange && s.rir >= planned.targetRir);

  if (allHitTop) {
    if (isBodyweight) {
      // Bodyweight chain: reps -> tempo -> range -> next exercise in chain.
      return [{ kind: "reps", exerciseId: planned.exerciseId, from: topOfRange, to: topOfRange + 2, reason: { id: R.BodyweightTop } }];
    }
    const nw = nextWeight(planned.loadKg!, client.env.weightsKg);
    const jump = nw !== undefined && planned.loadKg !== undefined ? (nw - planned.loadKg) / planned.loadKg : 0;
    if (nw === undefined) {
      return [{ kind: "add-set", exerciseId: planned.exerciseId, to: planned.sets + 1, reason: { id: R.HitTopRange, params: { note: "no heavier weight owned" } } }];
    }
    if (jump > 0.10) {
      // Home dumbbell jumps >10%: do not jump. Add reps past the range first.
      return [{ kind: "reps", exerciseId: planned.exerciseId, from: topOfRange, to: topOfRange + 3, reason: { id: R.WeightJumpTooBig, params: { from: planned.loadKg!, to: nw! } } }];
    }
    return [{ kind: "load", exerciseId: planned.exerciseId, from: planned.loadKg, to: nw, reps: planned.targetReps, rir: planned.targetRir, reason: { id: R.HitTopRange } }];
  }

  const belowBottom = last.every((s) => s.reps < bottomOfRange) || planned.targetRir - worstRir >= 2;
  if (belowBottom) {
    const prev = history.flatMap((s) => s.sets.filter((st) => st.exerciseId === planned.exerciseId)).slice(0, -planned.sets);
    const prevBelow = prev.length >= planned.sets && prev.slice(-planned.sets).every((s) => s.reps < bottomOfRange);
    if (prevBelow) {
      const sorted = [...client.env.weightsKg].sort((a, b) => a - b);
      const lower = sorted.filter((w) => planned.loadKg !== undefined && w < planned.loadKg).pop();
      if (lower !== undefined) {
        return [{ kind: "load", exerciseId: planned.exerciseId, from: planned.loadKg, to: lower, reps: planned.targetReps, rir: planned.targetRir, reason: { id: R.BelowRangeTwice } }];
      }
    }
    return [{ kind: "hold", exerciseId: planned.exerciseId, reason: { id: R.BelowRange, params: { maxReps, rir: worstRir } } }];
  }

  // Within the range: same load, +1 rep on the weakest set.
  const weakest = last.reduce((a, b) => (b.reps < a.reps ? b : a));
  return [{ kind: "reps", exerciseId: planned.exerciseId, from: weakest.reps, to: weakest.reps + 1, reason: { id: R.InRange, params: { weakestSet: weakest.reps } } }];
}

/** Early triggers (plan section 7): deload, variation swap, resume after break. */
export function earlyTriggers(
  exerciseId: string,
  history: SessionLog[],
): Change[] {
  const sessions = history.filter((s) => s.sets.some((st) => st.exerciseId === exerciseId));
  if (sessions.length >= 2) {
    const lastTwo = sessions.slice(-2);
    const e = (s: SessionLog) => {
      const best = s.sets.filter((st) => st.exerciseId === exerciseId).reduce((a, b) => (b.loadKg! > a.loadKg! ? b : a));
      return e1rm(best.loadKg!, best.reps, best.rir);
    };
    if (lastTwo[0] && lastTwo[1] && e(lastTwo[1]) < e(lastTwo[0]) * 0.95) {
      return [{ kind: "hold", exerciseId, reason: { id: R.DeloadNow, params: { dropPct: 5 } } }];
    }
  }
  if (sessions.length >= 3) {
    const lastThree = sessions.slice(-3);
    const vals = lastThree.map((s) => {
      const best = s.sets.filter((st) => st.exerciseId === exerciseId).reduce((a, b) => (b.loadKg! > a.loadKg! ? b : a));
      return e1rm(best.loadKg!, best.reps, best.rir);
    });
    if (vals[0]! <= vals[vals.length - 1]!) {
      return [{ kind: "hold", exerciseId, reason: { id: R.VariationSwap, params: { sessions: 3 } } }];
    }
  }
  return [];
}

/** >=10 days without training: resume at ~90% of last loads, RIR + 1. */
export function resumeAfterBreak(loadKg: number | undefined, client: ClientModel): number | undefined {
  if (loadKg === undefined) return undefined;
  return roundDownToOwned(loadKg * 0.9, client.env.weightsKg);
}
