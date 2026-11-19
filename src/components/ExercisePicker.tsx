import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, uid, type Exercise, type ExerciseMode } from '../lib/db';
import { Sheet } from './ui';

export function ExercisePicker({ onPick, onClose }: { onPick: (ex: Exercise) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<ExerciseMode>('reps');
  const all = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []);
  const query = q.trim().toLowerCase();
  const list = (all ?? []).filter((e) => !query || e.name.toLowerCase().includes(query) || e.muscleGroup.toLowerCase().includes(query));
  const groups = new Map<string, Exercise[]>();
  for (const e of list) groups.set(e.muscleGroup, [...(groups.get(e.muscleGroup) ?? []), e]);
  const exact = all?.some((e) => e.name.toLowerCase() === query);

  const create = async () => {
    const ex: Exercise = { id: uid(), name: q.trim(), muscleGroup: 'Outros', mode, custom: true };
    await db.exercises.add(ex);
    onPick(ex);
  };

  return (
    <Sheet title="Escolher exercício" onClose={onClose}>
      <input className="input search" autoFocus placeholder="Buscar ou criar exercício…" value={q} onChange={(e) => setQ(e.target.value)} />
      {query && !exact && (
        <div className="card tight">
          <div className="row gap wrap">
            <span className="grow">
              Criar <b>“{q.trim()}”</b>
            </span>
            <select className="input sm" value={mode} onChange={(e) => setMode(e.target.value as ExerciseMode)}>
              <option value="reps">Repetições</option>
              <option value="tempo">Tempo</option>
            </select>
            <button className="btn primary sm" onClick={create}>
              Criar
            </button>
          </div>
        </div>
      )}
      {[...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([g, exs]) => (
          <div key={g}>
            <h4 className="group-title">{g}</h4>
            <ul className="list compact">
              {exs.map((e) => (
                <li key={e.id}>
                  <button className="list-item" onClick={() => onPick(e)}>
                    <span className="grow">{e.name}</span>
                    <small className="muted">{e.mode === 'tempo' ? '⏱ tempo' : 'reps'}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </Sheet>
  );
}
