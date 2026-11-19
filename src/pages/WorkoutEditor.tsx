import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExercisePicker } from '../components/ExercisePicker';
import { Field, Sheet, Stepper, TopBar } from '../components/ui';
import { db, uid, type Workout, type WorkoutItem } from '../lib/db';
import { buildEngineClient, loadEngineExercises, loadEngineRules, reasonLabel, toEngineExercise } from '../lib/engineAdapter';
import { passesHardFilters } from '../engine/filters';
import { suggestSubstitutions as suggest } from '../engine/substitution';

export function WorkoutEditor() {
  const { id = '', wid = '' } = useParams();
  const nav = useNavigate();
  const stored = useLiveQuery(() => db.workouts.get(wid), [wid]);
  const exercises = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])), []);
  const equipment = useLiveQuery(() => db.equipment.where('clientId').equals(id).toArray(), [id]);
  const [w, setW] = useState<Workout | null>(null);
  const [picking, setPicking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [subs, setSubs] = useState<{ itemKey: string; fromName: string; suggestions: { id: string; name: string; reason: string }[] } | null>(null);

  /** Contexto do motor (cliente + regras + exercícios etiquetados) para checagem e trocas. */
  const engine = useLiveQuery(async () => {
    if (!id) return undefined;
    const [client, rules, list] = await Promise.all([buildEngineClient(id), loadEngineRules(), loadEngineExercises()]);
    return { client, rules, list, byId: new Map(list.map((e) => [e.id, e])) };
  }, [id]);

  const filterLabel: Record<string, string> = {
    equipment: 'equipamento indisponível',
    noise: 'barulho não permitido',
    space: 'espaço insuficiente',
    complexity: 'complexidade acima do nível',
    'injury-rule': 'conflita com regra de lesão',
  };

  const failsFor = (exerciseId: string) => {
    if (!engine) return [];
    const ex = engine.byId.get(exerciseId);
    if (!ex) return []; // sem tags do motor: não participa da checagem automática
    return passesHardFilters(ex, engine.client, engine.rules);
  };

  const suggestFor = async (it: WorkoutItem) => {
    if (!engine) return;
    const ex = engine.byId.get(it.exerciseId) ?? (await toEngineExercise(it.exerciseId));
    if (!ex) return;
    const suggestions = suggest(ex, engine.client, engine.list, engine.rules).map((s) => ({
      id: s.exercise.id,
      name: s.exercise.name,
      reason: reasonLabel(s.reason),
    }));
    setSubs({ itemKey: it.key, fromName: ex.name, suggestions });
  };

  const applySub = (it: WorkoutItem, toId: string) => {
    updateItem(it.key, { exerciseId: toId, reason: { id: 'injury-rule-substitution', params: { from: it.exerciseId, to: toId } } });
    db.overrides.add({ id: uid(), clientId: id, at: Date.now(), what: 'substitute-exercise', from: it.exerciseId, to: toId, reason: 'suggested-by-engine' });
    setSubs(null);
  };

  useEffect(() => {
    if (stored && stored.id === wid && w?.id !== wid) setW(stored);
  }, [stored, w, wid]);

  if (stored === null) return <div className="page"><TopBar title="Treino não encontrado" back={`/clientes/${id}?tab=treinos`} /></div>;
  if (!w || w.id !== wid || !exercises) return <div className="page" />;

  const update = (patch: Partial<Workout>) => {
    setW({ ...w, ...patch });
    setDirty(true);
  };
  const updateItem = (key: string, patch: Partial<WorkoutItem>) =>
    update({ items: w.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) });
  const move = (i: number, d: number) => {
    const items = [...w.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    update({ items });
  };

  const save = async () => {
    await db.workouts.put({ ...w, name: w.name.trim() || 'Treino', updatedAt: Date.now() });
    setDirty(false);
    nav(`/clientes/${id}?tab=treinos`);
  };

  return (
    <div className="page">
      <TopBar
        title="Editar treino"
        back={true}
        right={
          <button className="btn primary sm" onClick={save}>
            Salvar{dirty ? ' •' : ''}
          </button>
        }
      />
      <main className="content stack">
        <Field label="Nome do treino">
          <input className="input" value={w.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>

        {w.items.map((it, i) => {
          const ex = exercises.get(it.exerciseId);
          const eq = equipment?.find((e) => e.id === it.equipmentId);
          const timed = ex?.mode === 'tempo';
          const fails = failsFor(it.exerciseId);
          return (
            <div key={it.key} className="card">
              <div className="card-head">
                <h3>
                  <span className="idx">{i + 1}</span> {ex?.name ?? 'Exercício removido'}
                </h3>
                <div className="row gap-sm">
                  <button className="icon-btn sm" title="Sugerir troca" aria-label="Sugerir troca" onClick={() => suggestFor(it)}>
                    ⇄
                  </button>
                  <button className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                    ↑
                  </button>
                  <button className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === w.items.length - 1} aria-label="Descer">
                    ↓
                  </button>
                  <button className="icon-btn sm danger" onClick={() => update({ items: w.items.filter((x) => x.key !== it.key) })} aria-label="Remover">
                    ✕
                  </button>
                </div>
              </div>
              {fails.length > 0 && (
                <div className="alert">
                  <b>⚠ {filterLabel[fails[0].filter] ?? fails[0].filter}</b>
                  <p className="small">{fails[0].detail}</p>
                  <button className="btn sm" onClick={() => suggestFor(it)}>
                    Sugerir troca segura
                  </button>
                </div>
              )}
              <div className="grid2">
                <Stepper label="Séries" value={it.sets} min={1} onChange={(v) => updateItem(it.key, { sets: Math.max(1, v ?? 1) })} />
                {timed ? (
                  <Stepper label="Duração" suffix="s" step={5} value={it.durationSec} onChange={(v) => updateItem(it.key, { durationSec: v })} />
                ) : (
                  <Stepper label="Repetições" value={it.reps} onChange={(v) => updateItem(it.key, { reps: v })} />
                )}
                <Stepper label="Carga" suffix="kg" step={eq?.weights.length ? 1 : 0.5} value={it.weightKg} onChange={(v) => updateItem(it.key, { weightKg: v || undefined })} />
                <Stepper label="Descanso" suffix="s" step={15} value={it.restSec} onChange={(v) => updateItem(it.key, { restSec: v ?? 0 })} />
              </div>
              {equipment && equipment.length > 0 && (
                <Field label="Equipamento">
                  <select className="input" value={it.equipmentId ?? ''} onChange={(e) => updateItem(it.key, { equipmentId: e.target.value || undefined })}>
                    <option value="">Peso corporal / nenhum</option>
                    {equipment.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {eq && eq.weights.length > 0 && (
                <div className="chips">
                  {eq.weights.map((kg) => (
                    <button key={kg} type="button" className={`chip btn-chip ${it.weightKg === kg ? 'on' : ''}`} onClick={() => updateItem(it.key, { weightKg: kg })}>
                      {kg}
                    </button>
                  ))}
                </div>
              )}
              <input className="input" placeholder="Observação (técnica, cadência, adaptação…)" value={it.notes ?? ''} onChange={(e) => updateItem(it.key, { notes: e.target.value || undefined })} />
            </div>
          );
        })}

        <button className="btn block" onClick={() => setPicking(true)}>
          + Adicionar exercício
        </button>

        <Field label="Observações do treino">
          <textarea className="input" rows={2} value={w.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} />
        </Field>

        <button className="btn primary block big" onClick={save}>
          Salvar treino
        </button>
        <div className="row gap">
          <button
            className="btn ghost grow"
            onClick={async () => {
              const nid = uid();
              await db.workouts.add({ ...w, id: nid, name: `${w.name} (cópia)`, items: w.items.map((x) => ({ ...x, key: uid() })), createdAt: Date.now(), updatedAt: Date.now() });
              setDirty(false);
              nav(`/clientes/${id}/treinos/${nid}`, { replace: true });
            }}
          >
            Duplicar
          </button>
          <button
            className="btn danger grow"
            onClick={async () => {
              if (!confirm(`Excluir ${w.name}?`)) return;
              await db.workouts.delete(w.id);
              nav(`/clientes/${id}?tab=treinos`, { replace: true });
            }}
          >
            Excluir
          </button>
        </div>
      </main>

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(ex) => {
            const last = w.items[w.items.length - 1];
            update({
              items: [
                ...w.items,
                {
                  key: uid(),
                  exerciseId: ex.id,
                  sets: last?.sets ?? 3,
                  reps: ex.mode === 'reps' ? 12 : undefined,
                  durationSec: ex.mode === 'tempo' ? 30 : undefined,
                  restSec: last?.restSec ?? 60,
                  notes: ex.cues,
                },
              ],
            });
            setPicking(false);
          }}
        />
      )}
      {subs && (
        <Sheet title={`Trocar: ${subs.fromName}`} onClose={() => setSubs(null)}>
          {subs.suggestions.length === 0 ? (
            <p className="muted">Nenhuma troca segura encontrada com o equipamento e as regras de lesão deste cliente. Escolha manualmente.</p>
          ) : (
            <div className="stack">
              <p className="muted small">Opções que respeitam as regras de lesão e o equipamento disponível:</p>
              {subs.suggestions.map((s) => {
                const it = w.items.find((x) => x.key === subs.itemKey);
                return (
                  <button
                    key={s.id}
                    className="card list-item"
                    onClick={() => it && applySub(it, s.id)}
                  >
                    <span className="grow">
                      <b>{s.name}</b>
                      <small className="muted">{s.reason}</small>
                    </span>
                    <span className="chev">›</span>
                  </button>
                );
              })}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
