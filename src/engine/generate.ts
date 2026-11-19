// generateProgram: the six-step pipeline (plan section 2).
// 1 safety gates -> 2 selection -> 3 dosing -> 4 assembly -> 5 prep -> 6 trainer
// review (step 6 happens in the app; the engine stops at a draft with reasons).
import type { ClientModel, Pattern, PlannedExercise, Program, SessionPlan, Rule, Exercise, GateBlock } from "./types.ts";
import { CATALOGUE, RULES } from "./catalogue.ts";
import { evaluateGates } from "./gates.ts";
import { passesHardFilters } from "./filters.ts";
import { rankForSlot } from "./scoring.ts";
import { doseFor, splitFor, slotsForDay } from "./dosing.ts";
import { seedLoad } from "./benchmarks.ts";
import { warmupFor, rampUpSets, cooldownFor } from "./warmup.ts";
import { fitToBudget, estimateMinutes } from "./assembly.ts";
import { R, ENGINE_VERSION } from "./reasons.ts";

export class GateError extends Error {
  blocks: GateBlock[];
  constructor(blocks: GateBlock[]) {
    super("Safety gate blocked generation: " + blocks.map((b) => b.message).join(" | "));
    this.blocks = blocks;
  }
}

export function generateProgram(
  client: ClientModel,
  opts: { catalogue?: Exercise[]; rules?: Rule[]; weeks?: number } = {},
): Program {
  const catalogue = opts.catalogue ?? CATALOGUE;
  const rules = opts.rules ?? RULES;
  const blocks = evaluateGates(client);
  if (blocks.length > 0) throw new GateError(blocks);

  const dose = doseFor(client);
  const split = splitFor(client.prefs.daysPerWeek);
  const tempoBy = (id: string) => catalogue.find((e) => e.id === id)?.tempoSecPerRep ?? 3;
  const sessions: SessionPlan[] = [];

  for (let week = 1; week <= (opts.weeks ?? 4); week++) {
    const isDeload = week % 4 === 0; // default 4-week block: 3 build + deload
    for (let dayIndex = 0; dayIndex < split.days.length; dayIndex++) {
      const day = split.days[dayIndex]!;
      const slots = slotsForDay(day) as Pattern[];
      const patterns: Pattern[] = [];
      const items: PlannedExercise[] = [];

      // pulse raiser must pass the same hard filters (e.g. knee impact rule)
      const jumpRope = catalogue.find((e) => e.id === "jump-rope");
      const raiser =
        !client.prefs.noJump && jumpRope && passesHardFilters(jumpRope, client, rules).length === 0
          ? "jump-rope"
          : "march-in-place";
      items.push(...warmupFor(slots, client, raiser));

      for (const slot of slots) {
        const ranked = rankForSlot(slot, client, catalogue)
          .map((c) => ({ ...c, fails: passesHardFilters(c.exercise, client, rules) }))
          .filter((c) => c.fails.length === 0);
        const pick = ranked[0];
        if (!pick) continue; // trainer must pick: slot left empty with a reason
        patterns.push(slot);
        const isCore = slot === "core";
        const ex = pick.exercise;
        const sets = isDeload ? 2 : isCore ? 3 : 4;
        const reps = isCore ? 12 : dose.reps[1]!;
        const loadKg = seedLoad(ex, reps, dose.rir[0]!, client);
        items.push({
          exerciseId: ex.id,
          block: isCore ? "core" : "main",
          sets,
          targetReps: reps,
          targetRir: isDeload ? Math.max(4, dose.rir[0]!) : dose.rir[0]!,
          loadKg,
          restMin: isCore ? 1 : dose.restMin[0]!,
          reason: { id: R.GoalMatch, params: { slot, score: pick.score, deload: isDeload } },
        });
        if (!isCore && loadKg !== undefined && items.filter((i) => i.block === "warmup").length === 2) {
          items.push(...rampUpSets(loadKg, client.env.weightsKg));
        }
      }

      items.push(...cooldownFor(["supine-hamstring-stretch"]));
      const fitted = fitToBudget(items, client.prefs.sessionMin, tempoBy);
      sessions.push({
        week, dayIndex,
        minutes: Math.round(estimateMinutes(fitted, tempoBy)),
        items: fitted,
      });
    }
  }

  return {
    id: `program-${client.clientId}-v${ENGINE_VERSION}`,
    clientId: client.clientId,
    goal: client.goal.primary,
    weeks: opts.weeks ?? 4,
    split: split.name,
    sessions,
    generatedFrom: client,
    engineVersion: ENGINE_VERSION,
    status: "draft",
  };
}
