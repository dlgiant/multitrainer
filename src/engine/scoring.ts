// Soft score 0-100 (plan section 3, order 3).
import type { ClientModel, Exercise, Pattern } from "./types.ts";

const GOAL_PATTERNS: Record<string, Pattern[]> = {
  strength: ["squat", "hinge", "h-push", "v-push", "h-pull", "v-pull"],
  hypertrophy: ["squat", "hinge", "lunge", "h-push", "v-push", "h-pull", "v-pull"],
  "fat-loss": ["squat", "hinge", "conditioning", "lunge", "h-push", "h-pull"],
  "general-fitness": ["squat", "hinge", "h-push", "h-pull", "carry", "core"],
  endurance: ["conditioning", "core", "lunge"],
  "mobility-rehab": ["mobility", "core"],
};

export function softScore(
  exercise: Exercise,
  patternSlot: Pattern,
  client: ClientModel,
  lastBlockIds: Set<string> = new Set(),
): number {
  let score = 0;
  if (exercise.pattern === patternSlot) score += 40;
  if (GOAL_PATTERNS[client.goal.primary]?.includes(exercise.pattern)) score += 10;
  const focusHit = exercise.muscles.primary.some((m) => client.prefs.focus.includes(m));
  if (focusHit) score += 15;
  if (client.prefs.likes.includes(exercise.id)) score += 10;
  if (client.prefs.dislikes.includes(exercise.id)) score -= 25;
  if (!lastBlockIds.has(exercise.id)) score += 10; // variety
  if (exercise.loadable && client.env.weightsKg.length >= 3) score += 5;
  return Math.max(0, Math.min(100, score));
}

/** Ranked candidates for a slot, after hard filters. */
export function rankForSlot(pattern: Pattern, client: ClientModel, catalogue: Exercise[], lastBlockIds: Set<string> = new Set()) {
  const seen = new Set<string>();
  return catalogue
    .map((ex) => ({
      exercise: ex,
      score: softScore(ex, pattern, client, lastBlockIds),
    }))
    .filter((x) => x.score >= 40) // must at least fill the slot
    .sort((a, b) => b.score - a.score || a.exercise.id.localeCompare(b.exercise.id))
    .filter((x) => {
      const dup = seen.has(x.exercise.id);
      seen.add(x.exercise.id);
      return !dup;
    });
}
