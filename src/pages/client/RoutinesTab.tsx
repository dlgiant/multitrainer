import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Empty, Field, Sheet, Stepper } from '../../components/ui';
import { db, type Client, type Routine, type RoutineItem } from '../../lib/db';
import { reasonLabel } from '../../lib/engineAdapter';
import {
  WEEKDAY_SHORT,
  newRoutine,
  sendRoutineWhats,
  shareRoutineIcs,
  suggestRoutineItems,
} from '../../lib/routines';

export function RoutinesTab({ client }: { client: Client }) {
  const routines = useLiveQuery(() => db.routines.where('clientId').equals(client.id).sortBy('createdAt'), [client.id]);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [busy, setBusy] = useState(false);

  const create = () => setEditing(newRoutine(client.id));

  const suggest = async (routine: Routine) => {
    setBusy(true);
    try {
      const items = await suggestRoutineItems(client.id);
      setEditing({ ...routine, items });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const r = { ...editing, items: editing.items.length ? editing.items : [] };
    await db.routines.put({ ...r, id: r.id, updatedAt: Date.now() });
    setEditing(null);
  };

  const patchItem = (key: string, patch: Partial<RoutineItem>) => {
    if (!editing) return;
    setEditing({ ...editing, items: editing.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });
  };

  const removeItem = (key: string) => {
    if (!editing) return;
    setEditing({ ...editing, items: editing.items.filter((i) => i.key !== key) });
  };

  return (
    <div className="stack">
      {routines?.length ? (
        routines.map((r) => (
          <div key={r.id} className="card">
            <div className="card-head">
              <h3>{r.name}</h3>
              <div className="row">
                <button className="btn sm" onClick={() => setEditing(r)}>
                  Editar
                </button>
              </div>
            </div>
            <p className="muted">
              ⏰ {r.timeOfDay} · {[...r.days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join(' ')} ·{' '}
              {r.items.length} itens
            </p>
            <ul className="list">
              {r.items.map((i) => (
                <li key={i.key} className="muted">
                  <ItemName item={i} />
                </li>
              ))}
            </ul>
            <div className="row">
              <button className="btn sm primary" onClick={() => sendRoutineWhats(r, client.name, client.phone)}>
                Enviar WhatsApp
              </button>
              <button className="btn sm" onClick={() => shareRoutineIcs(r, client.name)}>
                Adicionar à agenda (.ics)
              </button>
            </div>
          </div>
        ))
      ) : (
        <Empty icon="🌙" title="Sem rotinas ainda">
          <button className="btn primary" onClick={create}>
            + Criar alongamento noturno
          </button>
        </Empty>
      )}

      {!!routines?.length && (
        <button className="btn block" onClick={create}>
          + Nova rotina
        </button>
      )}

      {editing && (
        <Sheet title={editing.name || 'Rotina'} onClose={() => setEditing(null)}>
          <div className="stack">
            <Field label="Nome">
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Hora do dia">
              <input
                type="time"
                value={editing.timeOfDay}
                onChange={(e) => setEditing({ ...editing, timeOfDay: e.target.value })}
              />
            </Field>
            <Field label="Dias da semana">
              <div className="row">
                {WEEKDAY_SHORT.map((d, i) => (
                  <button
                    key={i}
                    className={`btn sm chip ${editing.days.includes(i) ? 'primary' : ''}`}
                    onClick={() =>
                      setEditing({
                        ...editing,
                        days: editing.days.includes(i)
                          ? editing.days.filter((x) => x !== i)
                          : [...editing.days, i],
                      })
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>

            <div className="card-head">
              <h3>Itens</h3>
              <button className="btn sm primary" disabled={busy} onClick={() => suggest(editing)}>
                {busy ? 'Calculando…' : '🤖 Sugerir alongamentos (motor)'}
              </button>
            </div>
            {editing.items.length === 0 && (
              <p className="muted">
                Use o botão do motor: ele respeita as lesões, o equipamento e os músculos treinados na última sessão.
              </p>
            )}
            {editing.items.map((i) => (
              <RoutineItemEditor key={i.key} item={i} onPatch={(p) => patchItem(i.key, p)} onRemove={() => removeItem(i.key)} />
            ))}

            <button className="btn primary block" onClick={save}>
              Salvar rotina
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function RoutineItemEditor({
  item,
  onPatch,
  onRemove,
}: {
  item: RoutineItem;
  onPatch: (patch: Partial<RoutineItem>) => void;
  onRemove: () => void;
}) {
  const name = useLiveQuery(async () => (await db.exercises.get(item.exerciseId))?.name ?? item.exerciseId, [item.exerciseId]);
  return (
    <div className="card">
      <div className="card-head">
        <b>{name}</b>
        <button className="icon-btn" onClick={onRemove} aria-label="Remover">
          ✕
        </button>
      </div>
      {item.reason && <p className="muted small">{reasonLabel(item.reason)}</p>}
      <div className="row">
        <Stepper label="Duração" value={item.holdSec} onChange={(v) => onPatch({ holdSec: v })} step={5} min={5} suffix="s" />
        <label className="field row">
          <input type="checkbox" checked={!!item.perSide} onChange={(e) => onPatch({ perSide: e.target.checked })} />
          <span>por lado</span>
        </label>
      </div>
    </div>
  );
}

function ItemName({ item }: { item: RoutineItem }) {
  const name = useLiveQuery(async () => (await db.exercises.get(item.exerciseId))?.name ?? item.exerciseId, [item.exerciseId]);
  return (
    <span>
      {name}
      {item.holdSec ? ` — ${item.holdSec}s${item.perSide ? ' por lado' : ''}` : ''}
    </span>
  );
}
