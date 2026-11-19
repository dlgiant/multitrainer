import { db, uid, type Equipment, type Exercise, type Session, type SessionEntry, type Workout, type WorkoutItem } from './db';
import { fmtKg } from './utils';

/** Última vez que o cliente fez este exercício (sessão finalizada). */
function lastEntryFor(history: Session[], exerciseId: string): SessionEntry | undefined {
  for (const s of history) {
    const e = s.entries.find((x) => x.exerciseId === exerciseId && x.sets.some((st) => st.done));
    if (e) return e;
  }
  return undefined;
}

function nextWeight(current: number, eq?: Equipment) {
  const opts = eq?.weights ?? [];
  return opts.find((w) => w > current + 1e-9);
}

interface Plan {
  reps?: number;
  durationSec?: number;
  weightKg?: number;
  suggestion?: string;
}

/**
 * Progressão simples estilo "dupla progressão":
 * - Completou todas as séries no alvo → sobe a carga para o próximo peso disponível no equipamento do cliente
 *   (ou +1 rep / +5 s se não houver carga maior disponível).
 * - Não completou → repete a carga anterior.
 */
export function planFor(item: WorkoutItem, ex: Exercise, last: SessionEntry | undefined, eq?: Equipment): Plan {
  const base: Plan = { reps: item.reps, durationSec: item.durationSec, weightKg: item.weightKg };
  if (!last) return base;
  const done = last.sets.filter((s) => s.done);
  if (!done.length) return base;

  if (ex.mode === 'tempo') {
    const lastDur = Math.max(...done.map((s) => s.durationSec ?? 0));
    const target = item.durationSec ?? lastDur;
    const hitAll = done.length >= item.sets && done.every((s) => (s.durationSec ?? 0) >= target);
    const lastW = Math.max(...done.map((s) => s.weightKg ?? 0)) || undefined;
    if (hitAll) return { durationSec: Math.max(target, lastDur) + 5, weightKg: lastW, suggestion: `Completou ${lastDur}s em todas — +5 s` };
    return { durationSec: target, weightKg: lastW, suggestion: `Repetir: última vez ${done.length}/${item.sets} séries` };
  }

  const lastW = Math.max(...done.map((s) => s.weightKg ?? 0));
  const targetReps = item.reps ?? Math.max(...done.map((s) => s.reps ?? 0));
  const hitAll = done.length >= item.sets && done.every((s) => (s.reps ?? 0) >= targetReps);

  if (!hitAll) {
    return {
      reps: targetReps,
      weightKg: lastW || item.weightKg,
      suggestion: `Repetir ${lastW ? fmtKg(lastW) : 'carga'}: última vez ${done.length}/${item.sets} séries no alvo`,
    };
  }
  if (lastW > 0) {
    const nw = nextWeight(lastW, eq);
    if (nw != null) return { reps: targetReps, weightKg: nw, suggestion: `Completou tudo com ${fmtKg(lastW)} — subir para ${fmtKg(nw)}` };
    return { reps: targetReps + 1, weightKg: lastW, suggestion: `Carga máxima disponível (${fmtKg(lastW)}) — +1 rep` };
  }
  return { reps: targetReps + 1, weightKg: undefined, suggestion: `Completou tudo — +1 rep` };
}

export async function startSession(clientId: string, workout?: Workout): Promise<string> {
  const history = (await db.sessions.where('clientId').equals(clientId).toArray())
    .filter((s) => s.endedAt)
    .sort((a, b) => b.startedAt - a.startedAt);
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  const equipment = new Map((await db.equipment.where('clientId').equals(clientId).toArray()).map((e) => [e.id, e]));

  const entries: SessionEntry[] = [];
  for (const item of workout?.items ?? []) {
    const ex = exercises.get(item.exerciseId);
    if (!ex) continue;
    const plan = planFor(item, ex, lastEntryFor(history, ex.id), item.equipmentId ? equipment.get(item.equipmentId) : undefined);
    entries.push({
      key: uid(),
      exerciseId: ex.id,
      exerciseName: ex.name,
      mode: ex.mode,
      equipmentId: item.equipmentId,
      restSec: item.restSec,
      notes: item.notes,
      suggestion: plan.suggestion,
      sets: Array.from({ length: Math.max(1, item.sets) }, () => ({
        reps: ex.mode === 'reps' ? plan.reps : undefined,
        durationSec: ex.mode === 'tempo' ? plan.durationSec ?? 30 : undefined,
        weightKg: plan.weightKg,
        done: false,
      })),
    });
  }

  const id = uid();
  await db.sessions.add({
    id,
    clientId,
    workoutId: workout?.id,
    workoutName: workout?.name ?? 'Treino livre',
    startedAt: Date.now(),
    entries,
  });
  return id;
}

export function newEntry(ex: Exercise, history: Session[], restSec = 60): SessionEntry {
  const last = lastEntryFor(history, ex.id);
  const lastDone = last?.sets.filter((s) => s.done) ?? [];
  const tmpl = lastDone[lastDone.length - 1];
  const n = Math.max(3, lastDone.length);
  return {
    key: uid(),
    exerciseId: ex.id,
    exerciseName: ex.name,
    mode: ex.mode,
    restSec: last?.restSec ?? restSec,
    equipmentId: last?.equipmentId,
    suggestion: last ? 'Valores da última sessão' : undefined,
    sets: Array.from({ length: n }, () => ({
      reps: ex.mode === 'reps' ? tmpl?.reps ?? 10 : undefined,
      durationSec: ex.mode === 'tempo' ? tmpl?.durationSec ?? 30 : undefined,
      weightKg: tmpl?.weightKg,
      done: false,
    })),
  };
}

export function sessionVolume(s: Session) {
  let sets = 0;
  let volume = 0;
  for (const e of s.entries)
    for (const st of e.sets)
      if (st.done) {
        sets++;
        volume += (st.weightKg ?? 0) * (st.reps ?? 0);
      }
  return { sets, volume };
}

export function sessionSummaryText(s: Session, clientName: string) {
  const lines = [`💪 ${s.workoutName} — ${clientName}`, new Date(s.startedAt).toLocaleDateString('pt-BR'), ''];
  for (const e of s.entries) {
    const done = e.sets.filter((x) => x.done);
    if (!done.length) continue;
    const desc = done
      .map((x) =>
        e.mode === 'tempo'
          ? `${x.durationSec}s${x.weightKg ? ` @${x.weightKg}kg` : ''}`
          : `${x.reps ?? '?'}${x.weightKg ? `×${x.weightKg}kg` : ' reps'}`,
      )
      .join(', ');
    lines.push(`• ${e.exerciseName}: ${desc}`);
  }
  if (s.endedAt) lines.push('', `⏱ ${Math.round((s.endedAt - s.startedAt) / 60000)} min`);
  if (s.notes) lines.push('', s.notes);
  return lines.join('\n');
}
