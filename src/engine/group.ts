// Group workouts (marco 5, plan section 4): treino em dupla/grupo pequeno.
// 'shared' = mesma estrutura de sessões (mesmos slots, na mesma ordem) definida
// pelo líder; cada membro recebe a própria dose: cargas/reps/RIR do seu perfil,
// warm-up/cardio/relaxamento do próprio motor, e um exercício do líder só é
// mantido se passar nos hard filters do membro (senão o ranking escolhe outro).
// 'mixed' = programas totalmente independentes, apenas alinhados no calendário
// (mesma contagem de semanas) para treinarem juntos no mesmo horário.
import type { ClientModel, Exercise, ExerciseId, Pattern, Program, Rule, SessionPlan } from "./types.ts";
import { CATALOGUE, RULES } from "./catalogue.ts";
import { evaluateGates } from "./gates.ts";
import { generateProgram, buildSession, GateError, type BuildCtx } from "./generate.ts";
import { fitToBudget, estimateMinutes } from "./assembly.ts";
import { ENGINE_VERSION } from "./reasons.ts";

export type GroupMode = "shared" | "mixed";

export interface GroupProgram {
  id: string;
  mode: GroupMode;
  weeks: number;
  split: string;
  members: { clientId: string; name: string; program: Program }[];
}

/** Slots (padrões) de uma sessão na ordem; itens main/core carregam params.slot. */
export function slotsOfSession(s: SessionPlan): Pattern[] {
  return s.items
    .filter((it) => it.block === "main" || it.block === "core")
    .map((it) => it.reason.params?.slot as Pattern | undefined)
    .filter((slot): slot is Pattern => typeof slot === "string");
}

/** Exercício escolhido por slot na sessão: o que o modo 'shared' tenta manter. */
export function picksOfSession(s: SessionPlan): Partial<Record<Pattern, ExerciseId>> {
  const picks: Partial<Record<Pattern, ExerciseId>> = {};
  const items = s.items.filter((it) => it.block === "main" || it.block === "core");
  const slots = slotsOfSession(s);
  items.forEach((it, i) => {
    const slot = slots[i];
    if (slot) picks[slot] = it.exerciseId;
  });
  return picks;
}

/** Programa de um membro a partir das sessões do líder: mesma estrutura de
 *  slots, mesmas semanas, dosagem e filtros do membro. */
function memberProgramFrom(
  client: ClientModel,
  lead: Program,
  ctx: { catalogue: Exercise[]; rules: Rule[] },
): Program {
  const tempoBy = (id: string) => ctx.catalogue.find((e) => e.id === id)?.tempoSecPerRep ?? 3;
  const sessions: SessionPlan[] = lead.sessions.map((ls) => {
    const build: BuildCtx = { catalogue: ctx.catalogue, rules: ctx.rules, isDeload: ls.week % 4 === 0 };
    const raw = buildSession(client, slotsOfSession(ls), build, picksOfSession(ls));
    const fitted = fitToBudget(raw, client.prefs.sessionMin, tempoBy);
    return {
      week: ls.week,
      dayIndex: ls.dayIndex,
      minutes: Math.round(estimateMinutes(fitted, tempoBy)),
      items: fitted,
    };
  });
  return {
    id: `program-${client.clientId}-v${ENGINE_VERSION}`,
    clientId: client.clientId,
    goal: client.goal.primary,
    weeks: lead.weeks,
    split: lead.split,
    sessions,
    generatedFrom: client,
    engineVersion: ENGINE_VERSION,
    status: "draft",
  };
}

/** Gera programas para 2+ clientes que treinam juntos. No modo 'shared', o
 *  primeiro membro é o líder (estrutura/split/dias seguem o prefs dele);
 *  reordene o array para trocar o líder. Gates de segurança valem para todos:
 *  um membro bloqueado aborta o grupo inteiro (o trainer registra o
 *  clearance e regenera). */
export function generateGroupProgram(
  members: ClientModel[],
  mode: GroupMode = "shared",
  opts: { catalogue?: Exercise[]; rules?: Rule[]; weeks?: number } = {},
): GroupProgram {
  if (members.length < 2) throw new Error("generateGroupProgram precisa de >= 2 membros");
  const blocks = members.flatMap((m) => evaluateGates(m));
  if (blocks.length > 0) throw new GateError(blocks);

  const gen = (c: ClientModel) => generateProgram(c, opts);
  const id = `group-${members.map((m) => m.clientId).join("+")}-v${ENGINE_VERSION}`;

  if (mode === "mixed") {
    const progs = members.map(gen);
    return {
      id,
      mode,
      weeks: progs[0]!.weeks,
      split: progs[0]!.split,
      members: members.map((m, i) => ({ clientId: m.clientId, name: m.name, program: progs[i]! })),
    };
  }

  // shared: membros[0] é o líder.
  const leadProgram = gen(members[0]!);
  return {
    id,
    mode,
    weeks: leadProgram.weeks,
    split: leadProgram.split,
    members: members.map((m, i) => ({
      clientId: m.clientId,
      name: m.name,
      program:
        i === 0
          ? leadProgram
          : memberProgramFrom(m, leadProgram, { catalogue: opts.catalogue ?? CATALOGUE, rules: opts.rules ?? RULES }),
    })),
  };
}
