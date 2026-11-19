import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Empty } from '../../components/ui';
import { db, uid } from '../../lib/db';

export function WorkoutsTab({ clientId, onStart }: { clientId: string; onStart: (workoutId: string) => void }) {
  const nav = useNavigate();
  const workouts = useLiveQuery(() => db.workouts.where('clientId').equals(clientId).sortBy('name'), [clientId]);
  const exercises = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e.name])), []);

  const create = async () => {
    const id = uid();
    const n = (workouts?.length ?? 0) + 1;
    await db.workouts.add({
      id,
      clientId,
      name: `Treino ${String.fromCharCode(64 + Math.min(n, 26))}`,
      items: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    nav(`/clientes/${clientId}/treinos/${id}`);
  };

  return (
    <section className="stack">
      {workouts?.length === 0 ? (
        <Empty icon="📋" title="Nenhum treino montado">
          <p className="muted">Monte treinos (A, B, C…) com séries, repetições, carga e descanso.</p>
        </Empty>
      ) : (
        workouts?.map((w) => (
          <div key={w.id} className="card">
            <div className="card-head">
              <h3>{w.name}</h3>
              <div className="row gap-sm">
                <button className="btn sm" onClick={() => nav(`/clientes/${clientId}/treinos/${w.id}`)}>
                  Editar
                </button>
                <button className="btn primary sm" onClick={() => onStart(w.id)} disabled={!w.items.length}>
                  ▶ Iniciar
                </button>
              </div>
            </div>
            <ol className="ex-summary">
              {w.items.map((it) => (
                <li key={it.key}>
                  <span>{exercises?.get(it.exerciseId) ?? '—'}</span>
                  <small className="muted">
                    {it.sets}×{it.durationSec ? `${it.durationSec}s` : it.reps ?? '?'}
                    {it.weightKg ? ` · ${it.weightKg} kg` : ''}
                  </small>
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
      <button className="btn primary block" onClick={create}>
        + Novo treino
      </button>
      {workouts && workouts.length > 0 && (
        <p className="muted small center">
          Dica: ao iniciar, as cargas são preenchidas com base na última sessão e sugerem progressão automaticamente.
        </p>
      )}
    </section>
  );
}
