// generateProgram: the six-step pipeline (plan section 2).
// 1 safety gates -> 2 selection -> 3 dosing -> 4 assembly -> 5 prep -> 6 trainer
// review (step 6 happens in the app; the engine stops at a draft with reasons).
import type { Change, ClientModel, Exercise, ExerciseId, GateBlock, Pattern, PlannedExercise, Program, Rule, SessionLog, SessionPlan } from "./types.ts";
import { CATALOGUE, RULES } from "./catalogue.ts";
import { evaluateGates } from "./gates.ts";
import { passesHardFilters } from "./filters.ts";
import { rankForSlot } from "./scoring.ts";
import { doseFor, splitFor } from "./dosing.ts";
import { sequenceFor } from "./sequence.ts";
import { seedLoad } from "./benchmarks.ts";
import { warmupFor, rampUpSets, cooldownFor } from "./warmup.ts";
import { fitToBudget, estimateMinutes } from "./assembly.ts";
import { cardioFor } from "./cardio.ts";
import { progress } from "./progress.ts";
import { suggestStretches } from "./routine.ts";
import { R, ENGINE_VERSION } from "./reasons.ts";

export class GateError extends Error {
  blocks: GateBlock[];
  constructor(blocks: GateBlock[]) {
    super("Safety gate blocked generation: " + blocks.map((b) => b.message).join(" | "));
    this.blocks = blocks;
  }
}

/** Contexto de montagem de uma sessão (reusado pelo modo grupo). */
export interface BuildCtx {
  catalogue: Exercise[];
  rules: Rule[];
  isDeload: boolean;
}

/** Monta um dia de treino bruto (antes do orçamento de tempo): warm-up,
 *  primers, slots, cardio e relaxamento. `prefer` é o mapa slot -> exercício do
 *  líder do grupo: se o exercício preferido passar nos hard filters do
 *  próprio cliente, ele é mantido (mesmo treino para o casal); senão o ranking
 *  deste cliente escolhe uma alternativa segura. */
export function buildSession(
  client: ClientModel,
  slots: Pattern[],
  ctx: BuildCtx,
  prefer?: Partial<Record<Pattern, ExerciseId>>,
): PlannedExercise[] {
  const { catalogue, rules, isDeload } = ctx;
  const dose = doseFor(client);
  const items: PlannedExercise[] = [];

  // pulse raiser must pass the same hard filters (e.g. knee impact rule)
  const jumpRope = catalogue.find((e) => e.id === "jump-rope");
  const raiser =
    !client.prefs.noJump && jumpRope && passesHardFilters(jumpRope, client, rules).length === 0
      ? "jump-rope"
      : "march-in-place";
  items.push(...warmupFor(slots, client, raiser));

  // cardio (marco 4): early = logo após o warm-up; late = antes do relaxamento
  const cardio = cardioFor(client, catalogue, rules, isDeload);
  if (cardio && cardio.placement === "early") items.push(cardio.item);

  for (const slot of slots) {
    const ranked = rankForSlot(slot, client, catalogue)
      .map((c) => ({ ...c, fails: passesHardFilters(c.exercise, client, rules) }))
      .filter((c) => c.fails.length === 0);
    const wanted = prefer?.[slot];
    const kept = wanted ? ranked.find((c) => c.exercise.id === wanted) : undefined;
    const pick = kept ?? ranked[0];
    if (!pick) continue; // trainer must pick: slot left empty with a reason
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
      reason: {
        id: R.GoalMatch,
        params: { slot, score: pick.score, deload: isDeload, ...(wanted ? { shared: kept !== undefined } : {}) },
      },
    });
    if (!isCore && loadKg !== undefined && items.filter((i) => i.block === "warmup").length === 2) {
      items.push(...rampUpSets(loadKg, client.env.weightsKg));
    }
  }

  if (cardio && cardio.placement === "late") items.push(cardio.item);
  items.push(...cooldownFor(["supine-hamstring-stretch"]));
  return items;
}

export function generateProgram(
  client: ClientModel,
  opts: { catalogue?: Exercise[]; rules?: Rule[]; weeks?: number; mode?: "block" | "jit" } = {},
): Program {
  const catalogue = opts.catalogue ?? CATALOGUE;
  const rules = opts.rules ?? RULES;
  const blocks = evaluateGates(client);
  if (blocks.length > 0) throw new GateError(blocks);

  const mode = opts.mode ?? "block";
  const weeks = opts.weeks ?? 4;
  const splitName = splitFor(client.prefs.daysPerWeek).name;
  const tempoBy = (id: string) => catalogue.find((e) => e.id === id)?.tempoSecPerRep ?? 3;
  const sessions: SessionPlan[] = [];

  for (const s of sequenceFor(client, weeks)) {
    const isDeload = s.week % 4 === 0; // default 4-week block: 3 build + deload
    if (mode === "jit") {
      // JIT: only the sequence is stored; items are filled one session at a
      // time by nextSession, after the previous session has been logged.
      sessions.push({ week: s.week, dayIndex: s.dayIndex, minutes: 0, items: [], status: "pending", slots: s.slots });
      continue;
    }
    const items = buildSession(client, s.slots, { catalogue, rules, isDeload });
    const fitted = fitToBudget(items, client.prefs.sessionMin, tempoBy);
    sessions.push({
      week: s.week, dayIndex: s.dayIndex,
      minutes: Math.round(estimateMinutes(fitted, tempoBy)),
      items: fitted,
      status: "ready",
      slots: s.slots,
    });
  }

  // marco 3: evening routine suggested right after generation (block mode),
  // from the muscles trained in week 1. JIT mode leaves it to the app, which
  // suggests after activation (trained muscles come from logged sessions).
  let eveningRoutine: Program["eveningRoutine"];
  if (mode === "block") {
    const trained = [
      ...new Set(
        sessions
          .filter((s) => s.week === 1)
          .flatMap((s) => s.items)
          .flatMap((it) => {
            const ex = catalogue.find((e) => e.id === it.exerciseId);
            return ex ? [...ex.muscles.primary, ...ex.muscles.secondary] : [];
          }),
      ),
    ];
    eveningRoutine = suggestStretches(client, catalogue, rules, { trainedMuscles: trained, limit: 6 });
  }

  return {
    id: `program-${client.clientId}-v${ENGINE_VERSION}`,
    clientId: client.clientId,
    goal: client.goal.primary,
    weeks,
    split: splitName,
    sessions,
    generatedFrom: client,
    engineVersion: ENGINE_VERSION,
    status: "draft",
    mode,
    eveningRoutine,
  };
}

// ---------- JIT: next session is generated only after the previous is logged ----------

/** Readiness thresholds (plan section 7): last log at/beyond these => the next
 *  session is trimmed one set per main/core item with a readiness-low reason. */
export const READINESS_LOW = { soreness: 7, pain: 4, energy: 3, sleep: 4 } as const;

export interface NextSessionResult {
  program: Program;        // new Program with the target session filled and "ready"
  session: SessionPlan;    // the generated session (same object as in program.sessions)
  changes: Change[];       // progress diffs that were applied to this session
  readinessLow: boolean;
}

/** Applies progress changes (load/reps/add-set/regress) to the matching items
 *  of the upcoming session. Regress swaps the exercise only if it passes the
 *  client's hard filters; load is cleared for the trainer to re-dose. */
function applyChanges(
  items: PlannedExercise[],
  changes: Change[],
  client: ClientModel,
  catalogue: Exercise[],
  rules: Rule[],
): PlannedExercise[] {
  let out = items;
  for (const c of changes) {
    out = out.map((it) => {
      if (it.exerciseId !== c.exerciseId) return it;
      switch (c.kind) {
        case "load":
          return { ...it, loadKg: c.to };
        case "reps":
          return { ...it, targetReps: c.to };
        case "add-set":
          return { ...it, sets: c.to };
        case "regress": {
          const ex = catalogue.find((e) => e.id === c.to);
          if (ex && passesHardFilters(ex, client, rules).length === 0) {
            return { ...it, exerciseId: c.to, loadKg: undefined };
          }
          return it;
        }
        default:
          return it; // hold / tempo: no item-level change
      }
    });
  }
  return out;
}

/** Generates the next pending session of a JIT program. Returns null when
 *  there is nothing pending or when the previous session in the sequence has
 *  no SessionLog yet ("next workout only after the last one is finished").
 *  Re-runs the safety gates, then applies progress(history) to the upcoming
 *  session, then the readiness gate from the last log. Pure: returns a new
 *  Program; feed it back in on the next call. */
export function nextSession(
  client: ClientModel,
  program: Program,
  history: SessionLog[],
  opts: { catalogue?: Exercise[]; rules?: Rule[] } = {},
): NextSessionResult | null {
  const catalogue = opts.catalogue ?? CATALOGUE;
  const rules = opts.rules ?? RULES;
  const blocks = evaluateGates(client);
  if (blocks.length > 0) throw new GateError(blocks);

  const sessions = program.sessions;
  const idx = sessions.findIndex((s) => (s.status ?? "pending") === "pending" || s.items.length === 0);
  if (idx === -1) return null; // block complete
  if (idx > 0) {
    const prev = sessions[idx - 1]!;
    const finished = history.some((h) => h.week === prev.week && h.dayIndex === prev.dayIndex);
    if (!finished) return null;
  }

  const target = sessions[idx]!;
  const slots = (target.slots ?? sequenceFor(client, program.weeks)[idx]?.slots ?? []) as Pattern[];
  const isDeload = target.week % 4 === 0;
  const tempoBy = (id: string) => catalogue.find((e) => e.id === id)?.tempoSecPerRep ?? 3;

  let items = fitToBudget(buildSession(client, slots, { catalogue, rules, isDeload }), client.prefs.sessionMin, tempoBy);
  const changes = progress(program, history);
  items = applyChanges(items, changes, client, catalogue, rules);

  const r = history[history.length - 1]?.readiness;
  const readinessLow = !!r && (r.soreness >= READINESS_LOW.soreness || r.pain >= READINESS_LOW.pain || r.energy <= READINESS_LOW.energy || r.sleep <= READINESS_LOW.sleep);
  if (readinessLow && r) {
    items = items.map((it) =>
      it.block === "main" || it.block === "core"
        ? { ...it, sets: Math.max(2, it.sets - 1), reason: { id: R.ReadinessLow, params: { sleep: r.sleep, soreness: r.soreness, energy: r.energy, pain: r.pain } } }
        : it,
    );
  }

  const session: SessionPlan = {
    ...target,
    minutes: Math.round(estimateMinutes(items, tempoBy)),
    items,
    status: "ready",
  };
  const programOut: Program = { ...program, sessions: sessions.map((s, i) => (i === idx ? session : s)) };
  return { program: programOut, session, changes, readinessLow };
}
