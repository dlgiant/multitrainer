// "Suggest substitution": walk the regression chain first, then same pattern
// with lower stress. Trainer sees the top 3 with reasons (plan section 3).
import type { ClientModel, Exercise, Rule, Reason } from "./types.ts";
import { R } from "./reasons.ts";
import { passesHardFilters } from "./filters.ts";

export interface Suggestion { exercise: Exercise; reason: Reason }

export function suggestSubstitutions(
  exercise: Exercise,
  client: ClientModel,
  catalogue: Exercise[],
  rules: Rule[],
  limit = 3,
): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>([exercise.id]);
  const find = (id?: string) => (id ? catalogue.find((e) => e.id === id) : undefined);
  const tryAdd = (ex: Exercise | undefined, reason: Reason) => {
    if (!ex || seen.has(ex.id)) return;
    if (passesHardFilters(ex, client, rules).length > 0) return;
    seen.add(ex.id);
    out.push({ exercise: ex, reason });
  };
  // 1. regression chain first (resolved within the given catalogue)
  let cur = find(exercise.regressesTo);
  while (cur) {
    const c = cur;
    tryAdd(c, { id: R.InjuryRuleSub, params: { from: exercise.id, to: c.id } });
    cur = find(c.regressesTo);
    if (out.length >= limit) return out;
  }
  // 2. same pattern with lower stress, mildest first
  const regionStress = (ex: Exercise): number =>
    Object.values(ex.stress).reduce((s, v) => s + v!.load + v!.range + v!.impact, 0);
  catalogue
    .filter((ex) => ex.pattern === exercise.pattern)
    .sort((a, b) => regionStress(a) - regionStress(b) || a.id.localeCompare(b.id))
    .forEach((ex) => {
      if (out.length < limit) {
        tryAdd(ex, { id: R.InjuryRuleSub, params: { from: exercise.id, to: ex.id } });
      }
    });
  return out;
}
