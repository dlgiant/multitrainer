// progress(program, history) -> Changes: a diff proposal for next week.
// Pure: never mutates the program. The trainer accepts all, some or none.
import type { Program, SessionLog, Change } from "./types.ts";
import { progressExercise } from "./progression.ts";

export function progress(program: Program, history: SessionLog[]): Change[] {
  const lastSession = history[history.length - 1];
  if (!lastSession) return [];
  const plannedSession = program.sessions
    .filter((s) => s.week === lastSession.week && s.dayIndex === lastSession.dayIndex)[0];
  if (!plannedSession) return [];
  const changes: Change[] = [];
  for (const item of plannedSession.items) {
    if (item.block === "warmup" || item.block === "cooldown" || item.block === "primer") continue;
    changes.push(...progressExercise(item, history, program.generatedFrom));
  }
  return changes;
}
