import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { BottomNav, Field, Sheet, TopBar } from '../components/ui';
import { db, uid, type Exercise, type ExerciseMode } from '../lib/db';

const GROUPS = ['Pernas', 'Glúteos', 'Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps', 'Core', 'Corpo inteiro', 'Cardio', 'Mobilidade', 'Outros'];

export function ExercisesPage() {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  const all = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []);
  const query = q.trim().toLowerCase();
  const list = (all ?? []).filter((e) => !query || e.name.toLowerCase().includes(query) || e.muscleGroup.toLowerCase().includes(query));
  const groups = new Map<string, Exercise[]>();
  for (const e of list) groups.set(e.muscleGroup, [...(groups.get(e.muscleGroup) ?? []), e]);

  return (
    <div className="page">
      <TopBar
        title="Exercícios"
        right={
          <button className="btn primary sm" onClick={() => setEditing('new')}>
            + Novo
          </button>
        }
      />
      <main className="content">
        <input className="input search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        {[...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([g, exs]) => (
            <div key={g}>
              <h4 className="group-title">{g}</h4>
              <ul className="list compact">
                {exs.map((e) => (
                  <li key={e.id}>
                    <button className="list-item" onClick={() => setEditing(e)}>
                      <span className="grow">
                        {e.name}
                        {e.cues && <small className="muted">{e.cues}</small>}
                      </span>
                      <small className="muted">{e.mode === 'tempo' ? '⏱' : 'reps'}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </main>
      <BottomNav />
      {editing && <ExerciseSheet existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ExerciseSheet({ existing, onClose }: { existing?: Exercise; onClose: () => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [group, setGroup] = useState(existing?.muscleGroup ?? 'Pernas');
  const [mode, setMode] = useState<ExerciseMode>(existing?.mode ?? 'reps');
  const [cues, setCues] = useState(existing?.cues ?? '');
  return (
    <Sheet title={existing ? 'Editar exercício' : 'Novo exercício'} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await db.exercises.put({ id: existing?.id ?? uid(), name: name.trim(), muscleGroup: group, mode, cues: cues.trim() || undefined, custom: existing?.custom ?? true });
          onClose();
        }}
      >
        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid2">
          <Field label="Grupo">
            <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
              {[...new Set([...GROUPS, group])].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as ExerciseMode)}>
              <option value="reps">Repetições</option>
              <option value="tempo">Tempo (cronômetro)</option>
            </select>
          </Field>
        </div>
        <Field label="Dicas de execução">
          <textarea className="input" rows={2} value={cues} onChange={(e) => setCues(e.target.value)} />
        </Field>
        <button className="btn primary block" disabled={!name.trim()}>
          Salvar
        </button>
        {existing && (
          <button
            type="button"
            className="btn danger block"
            onClick={async () => {
              const used = await db.workouts.filter((w) => w.items.some((i) => i.exerciseId === existing.id)).count();
              if (used) return alert(`Este exercício está em ${used} treino(s). Remova-o dos treinos antes de excluir.`);
              if (confirm(`Excluir ${existing.name}?`)) {
                await db.exercises.delete(existing.id);
                onClose();
              }
            }}
          >
            Excluir
          </button>
        )}
      </form>
    </Sheet>
  );
}
