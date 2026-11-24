// Evening stretch routine (milestone 2, plan section 5). Pure: picks mobility
// exercises that pass the injury rules and prioritise what today's sessions
// trained, the client's focus areas and stretches the injury rules prefer.
import type { ClientModel, Exercise, Rule, RoutineSuggestion } from "./types.ts";
import { R } from "./reasons.ts";
import { passesHardFilters } from "./filters.ts";
import { rulesForInjury } from "./catalogue.ts";

export type { RoutineSuggestion } from "./types.ts";

export interface RoutineContext {
  /** Músculos treinados hoje/semana (primary + secondary dos exercícios da sessão). */
  trainedMuscles: string[];
  /** Focos do cliente (default: client.prefs.focus). */
  focusAreas?: string[];
  /** Tamanho da rotina (default 6). */
  limit?: number;
}

export function suggestStretches(
  client: ClientModel,
  catalogue: Exercise[],
  rules: Rule[],
  ctx: RoutineContext,
): RoutineSuggestion[] {
  const limit = ctx.limit ?? 6;
  const focus = ctx.focusAreas ?? client.prefs.focus;
  const activeRules = client.injuries
    .filter((i) => i.status !== "cleared" && !i.clearedAt)
    .flatMap((i) => rulesForInjury(i, rules));

  const scored = catalogue
    .filter((ex) => ex.pattern === "mobility")
    .map((ex, i) => {
      if (passesHardFilters(ex, client, rules).length > 0) return null;
      const exMuscles = [...ex.muscles.primary, ...ex.muscles.secondary];
      const trainedHits = exMuscles.filter((m) => ctx.trainedMuscles.includes(m));
      const focusHit = exMuscles.some((m) => focus.includes(m));
      const injuryPrefer = activeRules.some((r) => r.prefer.includes(ex.id));
      let score = 10; // toda opção válida entra como base
      if (trainedHits.length > 0) score += 30 + 5 * trainedHits.length;
      if (focusHit) score += 15;
      if (injuryPrefer) score += 20;
      const reason: RoutineSuggestion["reason"] = injuryPrefer
        ? { id: R.StretchInjuryRule, params: { exercise: ex.id } }
        : trainedHits.length > 0
          ? { id: R.StretchTrained, params: { muscles: trainedHits.slice(0, 3).join(",") } }
          : focusHit
            ? { id: R.StretchFocus, params: { exercise: ex.id } }
            : { id: R.StretchGeneral, params: { exercise: ex.id } };
      return { ex, score, i, reason };
    })
    .filter((x): x is { ex: Exercise; score: number; i: number; reason: RoutineSuggestion["reason"] } => x !== null);

  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => ({ exercise: x.ex, reason: x.reason }));
}
