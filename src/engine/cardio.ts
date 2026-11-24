// Cardio block (plan section 4; marco 4). Pure: scores candidates by goal,
// level and time budget. HIIT entra depois (própria dose de rounds).
import type { ClientModel, Exercise, Rule } from "./types.ts";
import { passesHardFilters } from "./filters.ts";
import { R } from "./reasons.ts";

/** Minutos de cardio por objetivo. 0 = sem bloco de cardio na sessão. */
export function cardioMinutesFor(goal: ClientModel["goal"]["primary"], deload: boolean, requested: boolean): number {
  const base =
    goal === "fat-loss" ? 12
    : goal === "endurance" ? 10
    : goal === "general-fitness" || requested ? 8
    : 0;
  if (base === 0) return 0;
  return deload ? Math.max(4, Math.round(base * 0.6)) : base;
}

/** Primeira opção válida na ordem do catálogo (máquinas > caminhada).
 *  Respeita hard filters (lesões, equipamento, noJump) e dislikes. */
export function pickCardio(client: ClientModel, catalogue: Exercise[], rules: Rule[]): Exercise | undefined {
  return catalogue.find(
    (ex) =>
      ex.role === "cardio" &&
      !client.prefs.dislikes.includes(ex.id) &&
      passesHardFilters(ex, client, rules).length === 0,
  );
}

export interface CardioPlan {
  item: import("./types.ts").PlannedExercise;
  placement: "early" | "late";
}

/** Item de cardio pronto para inserir na sessão ('early' = após o warm-up;
 *  'late' = antes do relaxamento). */
export function cardioFor(client: ClientModel, catalogue: Exercise[], rules: Rule[], deload: boolean): CardioPlan | undefined {
  // Sem pedido explícito, só objetivos com perfil de condicionamento ganham cardio.
  const requested = client.prefs.cardioPlacement !== undefined;
  const minutes = cardioMinutesFor(client.goal.primary, deload, requested);
  const ex = minutes > 0 ? pickCardio(client, catalogue, rules) : undefined;
  if (!ex) return undefined;
  return {
    placement: client.prefs.cardioPlacement ?? "late",
    item: {
      exerciseId: ex.id,
      block: "cardio",
      sets: 1,
      targetReps: 0,
      targetRir: 0,
      restMin: 0,
      durationMin: minutes,
      reason: { id: R.CardioBlock, params: { exercise: ex.id, minutes, goal: client.goal.primary, deload } },
    },
  };
}
