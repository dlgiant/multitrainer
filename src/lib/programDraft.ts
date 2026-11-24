// Marco 3: gerador de blocos (plan section 2 — pipeline de 6 passos).
// O motor gera um rascunho (draft); nada vira treino sem revisão do treinador.
import { generateProgram, GateError } from '../engine/generate';
import { suggestSubstitutions, type Suggestion } from '../engine/substitution';
import type { ClientModel, Exercise, Program, Rule, SessionPlan } from '../engine/types';
import { buildEngineClient, loadEngineExercises, loadEngineRules, toEngineExercise } from './engineAdapter';
import { db, uid, type ProgramRecord, type Workout, type WorkoutItem } from './db';

/** Ids que o gerador aquece/resfria podem referenciar (catálogo do motor)
 *  mas que no app existem com outro nome — resolve pelo nome da biblioteca. */
const ENGINE_ID_ALIASES: Record<string, string> = {
  'jump-rope': 'Pular corda',
  'march-in-place': 'Corrida estacionária',
  'glute-bridge': 'Elevação pélvica',
  'band-row': 'Remada com elástico',
  'dead-bug': 'Dead bug',
  'hip-thrust': 'Elevação pélvica',
  'supine-hamstring-stretch': 'Alongamento de isquiotibiais (deitado)',
  'cat-cow': 'Gato-camelo',
  'child-pose': 'Postura da criança',
};

export type DraftResult = { ok: true; program: Program; client: ClientModel } | { ok: false; blocked: string[] };

/** Gera o rascunho do bloco do cliente (semanas 1-4: 3 build + deload). */
export async function generateDraft(clientId: string, weeks = 4): Promise<DraftResult> {
  const client = await buildEngineClient(clientId);
  const [catalogue, rules] = await Promise.all([loadEngineExercises(), loadEngineRules()]);
  try {
    const program = generateProgram(client, { catalogue, rules, weeks });
    return { ok: true, program, client };
  } catch (e) {
    if (e instanceof GateError) return { ok: false, blocked: e.blocks.map((b) => b.message) };
    throw e;
  }
}

/** Resolved id → id de exercício do banco (aliases do warm-up/cooldown). */
export async function resolveExerciseId(engineOrLibId: string): Promise<string | undefined> {
  const row = await db.exercises.get(engineOrLibId);
  if (row) return engineOrLibId;
  const alias = ENGINE_ID_ALIASES[engineOrLibId];
  if (!alias) return undefined;
  const byName = await db.exercises.where('name').equals(alias).first();
  return byName?.id;
}

/** Top-3 substituições do motor para um exercício do rascunho (plan section 3). */
export async function draftSubstitutions(
  clientId: string,
  exerciseId: string,
): Promise<Suggestion[]> {
  const client = await buildEngineClient(clientId);
  const [catalogue, rules, exercise] = await Promise.all([
    loadEngineExercises(),
    loadEngineRules(),
    toEngineExercise(exerciseId),
  ]);
  if (!exercise) return [];
  return suggestSubstitutions(exercise, client, catalogue as Exercise[], rules as Rule[]);
}

const BLOCK_LABEL: Record<string, string> = {
  warmup: 'Aquecimento',
  primer: 'Ativação',
  ramp: 'Aproximação',
  main: 'Principal',
  accessory: 'Acessório',
  core: 'Core',
  cooldown: 'Relaxamento',
  cardio: 'Cardio',
};

/** Rótulo do bloco + pseudo-exercícios do motor (ramp-up) não viram itens. */
export function isConvertableItem(it: { exerciseId: string }): boolean {
  return it.exerciseId !== 'ramp-up';
}

/** Remove, do rascunho, o item apontado pelo índice de itens "treináveis" (sem ramp-up). */
export function draftRemoveItemAt(
  p: Program,
  at: { week: number; day: number; index: number },
): Program {
  return {
    ...p,
    sessions: p.sessions.map((s) => {
      if (s.week !== at.week || s.dayIndex !== at.day) return s;
      let k = -1;
      const after = s.items.filter((it) => {
        if (!isConvertableItem(it)) return true;
        k += 1;
        return k !== at.index;
      });
      return { ...s, items: after };
    }),
  };
}

/** Sessão planejada → itens de treino do app. Ramp-up vira nota no 1º item principal. */
export async function sessionToItems(session: SessionPlan): Promise<WorkoutItem[]> {
  let mainSeen = false;
  const items: WorkoutItem[] = [];
  for (const it of session.items) {
    if (!isConvertableItem(it)) continue;
    const resolvedId = await resolveExerciseId(it.exerciseId);
    if (!resolvedId) continue; // exercício não existe no app: ignora (raro)
    const row = await db.exercises.get(resolvedId);
    if (!row) continue;
    const isCardio = it.block === 'cardio';
    const isTempo = isCardio || row.mode === 'tempo' || (!!row.holdSec && !row.loadable);
    const needsRampNote = it.block === 'main' && !mainSeen && session.items.some((x) => x.exerciseId === 'ramp-up');
    if (it.block === 'main') mainSeen = true;
    items.push({
      key: uid(),
      exerciseId: resolvedId,
      sets: it.sets,
      ...(isTempo ? { durationSec: isCardio ? Math.round((it.durationMin ?? 10) * 60) : row.holdSec ?? 30 } : { reps: it.targetReps }),
      weightKg: it.loadKg,
      restSec: Math.round(it.restMin * 60),
      targetRir: it.targetRir,
      reason: it.reason,
      pinned: it.pinned,
      notes:
        it.block === 'warmup' || it.block === 'primer'
          ? BLOCK_LABEL[it.block]
          : it.block === 'cooldown'
            ? BLOCK_LABEL[it.block]
            : needsRampNote
              ? 'Aquecimento de aproximação: 40/60/80% da carga × 8/5/3 antes'
              : undefined,
    });
  }
  return items;
}

/** Ativa o rascunho revisado: salva o programa e cria um treino por sessão. */
export async function activateProgram(
  clientId: string,
  program: Program,
  itemsBySession?: Map<string, WorkoutItem[]>,
): Promise<string> {
  const programId = uid();
  const at = Date.now();
  const record: ProgramRecord = {
    id: programId,
    clientId,
    goal: program.goal,
    startDate: new Date().toISOString().slice(0, 10),
    weeks: program.weeks,
    split: program.split,
    status: 'active',
    generatedFrom: program.generatedFrom,
    engineVersion: program.engineVersion,
    createdAt: at,
  };
  const workouts: Workout[] = [];
  for (const session of program.sessions) {
    const items = itemsBySession?.get(`${session.week}:${session.dayIndex}`) ?? (await sessionToItems(session));
    if (items.length === 0) continue;
    const name = `S${session.week} · Treino ${'ABCDEFG'[session.dayIndex] ?? session.dayIndex + 1}`;
    workouts.push({
      id: uid(),
      clientId,
      name,
      items,
      programId,
      week: session.week,
      day: session.dayIndex,
      createdAt: at,
      updatedAt: at,
    });
  }
  await db.transaction('rw', [db.programs, db.workouts], async () => {
    const prevActive = await db.programs.where('clientId').equals(clientId).toArray();
    for (const p of prevActive.filter((p) => p.status === 'active')) {
      await db.programs.update(p.id, { status: 'done' });
    }
    await db.programs.add(record);
    await db.workouts.bulkAdd(workouts);
  });
  return programId;
}
