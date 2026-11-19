// Marco 2: proposta de progressão do motor sobre um treino salvo.
// O treinador aceita tudo, parte ou nada (plano seção 7).
import type { Change, ClientModel, PlannedExercise, SessionLog } from '../engine/types';
import { progressExercise } from '../engine/progression';
import { buildEngineClient, reasonLabel } from './engineAdapter';
import { db, uid, type Session, type Workout, type WorkoutItem } from './db';

/** Sessões do app (Dexie) → histórico do motor. Semanas sintéticas pela ordem. */
export function toEngineLogs(sessions: Session[]): SessionLog[] {
  const done = sessions
    .filter((s) => !!s.endedAt)
    .sort((a, b) => a.endedAt! - b.endedAt!);
  return done
    .map((s, i) => {
      const sets = s.entries.flatMap((e) =>
        e.sets
          .filter((st) => st.done && st.reps != null)
          .map((st) => ({
            exerciseId: e.exerciseId,
            reps: st.reps!,
            loadKg: st.weightKg,
            rir: st.rir ?? 3,
            pain: st.pain,
          })),
      );
      return { week: Math.floor(i / 7) + 1, dayIndex: i % 7, readiness: s.readiness, sets };
    })
    .filter((s) => s.sets.length > 0);
}

function plannedFrom(item: WorkoutItem): PlannedExercise {
  return {
    exerciseId: item.exerciseId,
    block: 'main',
    sets: item.sets,
    targetReps: item.reps ?? 12,
    targetRir: item.targetRir ?? 3,
    loadKg: item.weightKg,
    restMin: item.restSec / 60,
    reason: { id: 'goal-match' },
  };
}

/** Proposta do motor para cada item do treino, dado o histórico de sessões. */
export async function proposedChanges(workout: Workout, history: Session[]): Promise<Change[]> {
  const client: ClientModel = await buildEngineClient(workout.clientId);
  const logs = toEngineLogs(history);
  const out: Change[] = [];
  for (const item of workout.items) {
    out.push(...progressExercise(plannedFrom(item), logs, client));
  }
  return out.filter((c) => c.kind !== 'hold');
}

/** Rótulo curto PT-BR da mudança (o que muda) — o motivo vai em chip separado. */
export function changeShortLabel(c: Change): string {
  switch (c.kind) {
    case 'load':
      return `Carga ${c.from ?? '—'} → ${c.to ?? '—'} kg`;
    case 'reps':
      return `Repetições ${c.from} → ${c.to}`;
    case 'add-set':
      return `Séries → ${c.to}`;
    case 'tempo':
      return `Tempo → ${c.to}`;
    case 'regress':
      return c.to && c.to !== c.exerciseId ? 'Regressão de exercício' : 'Regressão na progressão (dor relatada)';
    default:
      return 'Manter';
  }
}

export function changeReasonLabel(c: Change): string {
  return reasonLabel(c.reason);
}

/** Aplica as mudanças aceitas e devolve os itens novos + overrides a registrar. */
export async function applyChanges(
  workout: Workout,
  changes: Change[],
): Promise<{ items: WorkoutItem[]; overrides: { what: string; from?: string; to?: string; reason?: string }[] }> {
  const overrides: { what: string; from?: string; to?: string; reason?: string }[] = [];
  let items = workout.items.map((i) => ({ ...i }));

  for (const c of changes) {
    const idx = items.findIndex((i) => i.exerciseId === c.exerciseId);
    if (idx === -1) continue;
    const item = items[idx]!;
    switch (c.kind) {
      case 'load':
        items[idx] = { ...item, weightKg: c.to };
        break;
      case 'reps':
        items[idx] = { ...item, reps: c.to };
        break;
      case 'add-set':
        items[idx] = { ...item, sets: c.to };
        break;
      case 'tempo':
        items[idx] = { ...item, durationSec: Math.round(Number(c.to) * 3) || undefined };
        break;
      case 'regress': {
        // O motor aponta a regressão; o alvo vem da cadeia do próprio exercício.
        const row = await db.exercises.get(item.exerciseId);
        const target = row?.regressesTo;
        if (target) {
          items[idx] = { ...item, exerciseId: target, notes: `${item.notes ?? ''}`.trim() || undefined };
        }
        break;
      }
      default:
        break;
    }
    overrides.push({
      what: 'progression-diff',
      from: `${item.exerciseId} @ ${item.weightKg ?? 'corporal'}×${item.reps ?? ''} (${item.sets}s)`,
      to: `${items[idx]!.exerciseId} @ ${items[idx]!.weightKg ?? 'corporal'}×${items[idx]!.reps ?? ''} (${items[idx]!.sets}s)`,
      reason: c.reason.id,
    });
  }
  return { items, overrides };
}

/** Persiste as mudanças aceitas e registra aceitas/recusadas como overrides. */
export async function commitDiff(
  workout: Workout,
  accepted: Change[],
  rejected: Change[],
): Promise<void> {
  const { items, overrides } = await applyChanges(workout, accepted);
  const at = Date.now();
  await db.transaction('rw', [db.workouts, db.overrides], async () => {
    await db.workouts.update(workout.id, { items, updatedAt: at });
    for (const o of overrides) {
      await db.overrides.add({ id: uid(), clientId: workout.clientId, at, ...o });
    }
    for (const c of rejected) {
      await db.overrides.add({
        id: uid(),
        clientId: workout.clientId,
        at,
        what: 'rejected-engine-proposal',
        from: `${c.exerciseId} (${c.kind})`,
        to: undefined,
        reason: c.reason.id,
      });
    }
  });
}
