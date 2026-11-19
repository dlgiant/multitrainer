// Session assembly + time budget (plan section 4). Trim order: cool-down first,
// then accessory sets, then accessory exercises, then supersetting. Never the
// main block or the warm-up.
import type { PlannedExercise } from "./types.ts";
import { R } from "./reasons.ts";

export function estimateMinutes(items: PlannedExercise[], tempoBy: (id: string) => number): number {
  return items.reduce((min, it) => {
    const perSet = (it.targetReps * tempoBy(it.exerciseId)) / 60 + it.restMin;
    return min + perSet * it.sets;
  }, 0);
}

export function fitToBudget(
  items: PlannedExercise[],
  budgetMin: number,
  tempoBy: (id: string) => number,
): PlannedExercise[] {
  let plan = [...items];
  const over = () => estimateMinutes(plan, tempoBy) - budgetMin;
  if (over() <= 0) return plan;
  // 1. cool-down first
  plan = plan.filter((it) => it.block !== "cooldown");
  if (over() <= 0) return plan;
  // 2. accessory sets
  for (let i = plan.length - 1; i >= 0 && over() > 0; i--) {
    const it = plan[i]!;
    if (it.block === "accessory" && it.sets > 2) {
      plan[i] = { ...it, sets: it.sets - 1 };
    }
  }
  if (over() <= 0) return plan;
  // 3. drop accessory exercises (never main / warmup / core)
  plan = plan.filter((it) => it.block !== "accessory" || it.pinned);
  if (over() <= 0) return plan;
  // 4. superset non-competing accessories (halve their rest)
  plan = plan.map((it) =>
    it.block === "accessory" ? { ...it, restMin: Math.max(0.5, it.restMin / 2), reason: { ...it.reason, id: R.TimeBudget } } : it,
  );
  return plan;
}
