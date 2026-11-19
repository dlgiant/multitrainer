// Marco 3: aba "Programa" — gerador de blocos do motor (plan section 2).
// Fluxo: gerar rascunho → revisar (trocar/editar/fixar/remover) → ativar.
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty, Sheet, Stepper } from '../../components/ui';
import { db } from '../../lib/db';
import { reasonLabel } from '../../lib/engineAdapter';
import { draftRemoveItemAt, activateProgram, draftSubstitutions, generateDraft, isConvertableItem, type DraftResult } from '../../lib/programDraft';
import { suggestEveningRoutine, WEEKDAY_SHORT } from '../../lib/routines';
import type { Routine } from '../../lib/db';
import type { PlannedExercise, Program } from '../../engine/types';

const BLOCK_LABEL: Record<string, string> = {
  warmup: 'Aquecimento',
  primer: 'Ativação',
  main: 'Principal',
  accessory: 'Acessório',
  core: 'Core',
  cooldown: 'Relaxamento',
};

export function ProgramTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const nav = useNavigate();
  const programs = useLiveQuery(async () => (await db.programs.where('clientId').equals(clientId).toArray()).sort((a, b) => b.createdAt - a.createdAt), [clientId]);
  const active = programs?.find((p) => p.status === 'active');
  const workouts = useLiveQuery(
    async () => (await db.workouts.where('clientId').equals(clientId).sortBy('name')),
    [clientId],
  );
  const programWorkouts = useMemo(
    () => (active ? (workouts ?? []).filter((w) => w.programId === active.id).sort((a, b) => (a.week ?? 0) - (b.week ?? 0) || (a.day ?? 0) - (b.day ?? 0)) : []),
    [active, workouts],
  );
  const exercises = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e.name])), []);

  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Program | null>(null);
  const [blocked, setBlocked] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swap, setSwap] = useState<{ week: number; day: number; index: number } | null>(null);
  const [opened, setOpened] = useState(false);
  const [evening, setEvening] = useState<Routine | null>(null);

  const gen = async () => {
    setBusy(true);
    setError(null);
    try {
      const result: DraftResult = await generateDraft(clientId);
      if (result.ok) {
        setDraft(result.program);
        setBlocked(null);
      } else {
        setDraft(null);
        setBlocked(result.blocked);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await activateProgram(clientId, draft);
      // Rotina de fim de dia (plan section 5): sugerida junto com o programa,
      // apenas se o cliente ainda não tem rotinas. O treinador revisa na aba Rotinas.
      const evening = await suggestEveningRoutine(clientId);
      if (evening) await db.routines.put(evening);
      setEvening(evening ?? null);
      setDraft(null);
      setOpened(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack">
      {evening && (
        <div className="card">
          <div className="card-head">
            <h3>🌙 Rotina de fim de dia sugerida</h3>
            <button className="btn sm" onClick={() => setEvening(null)}>
              OK
            </button>
          </div>
          <p className="muted small">
            {evening.items.length} alongamentos · {evening.timeOfDay} ·{' '}
            {[...evening.days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join(' ')} — criada junto com o
            programa porque o cliente não tinha rotinas. Revise e ajuste na aba Rotinas.
          </p>
        </div>
      )}
      {active && !draft && (
        <div className="card">
          <div className="card-head">
            <h3>Programa ativo</h3>
            <button className="btn sm" onClick={() => nav(`/clientes/${clientId}?tab=treinos`)}>
              Treinos
            </button>
          </div>
          <p className="muted small">
            {active.weeks} semanas · {active.split} · desde {active.startDate} · motor v{active.engineVersion}
          </p>
          <ul className="list compact">
            {programWorkouts.map((w) => (
              <li key={w.id}>
                <button className="list-item" onClick={() => nav(`/clientes/${clientId}/treinos/${w.id}`)}>
                  <span className="grow">
                    <b>{w.name}</b>
                    <small className="muted">{w.items.length} exercícios</small>
                  </span>
                  <span className="chev">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocked && (
        <div className="alert">
          <b>⚠ Portão de segurança do motor</b>
          {blocked.map((m) => (
            <p key={m} className="small">
              {m}
            </p>
          ))}
          <p className="small muted">
            O motor só gera planos com liberação registrada. Registre a liberação (com data) na aba Perfil.
          </p>
        </div>
      )}
      {error && (
        <div className="alert">
          <b>Erro ao gerar</b>
          <p className="small">{error}</p>
        </div>
      )}

      {draft ? (
        <DraftReview
          draft={draft}
          exercises={exercises ?? new Map()}
          busy={busy}
          onChange={setDraft}
          onSwap={setSwap}
          onActivate={activate}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <>
          {!active && !blocked && (
            <Empty icon="🧠" title="Nenhum programa gerado">
              <p className="muted">
                O motor lê objetivo, lesões, equipamentos e preferências de {clientName} e monta um rascunho de 4 semanas
                (3 de progressão + deload). Cada escolha vem com o motivo.
              </p>
            </Empty>
          )}
          <button className="btn primary block" onClick={gen} disabled={busy}>
            {busy ? 'Gerando…' : active ? 'Gerar novo bloco' : 'Gerar programa (rascunho)'}
          </button>
        </>
      )}

      {swap && draft && (
        <SwapSheet
          clientId={clientId}
          draft={draft}
          target={swap}
          exercises={exercises ?? new Map()}
          onPick={(newId, loadable) => {
            setDraft((d) =>
              patchItem(d!, swap, (it) => ({ ...it, exerciseId: newId, loadKg: loadable ? it.loadKg : undefined })),
            );
            setSwap(null);
          }}
          onClose={() => setSwap(null)}
        />
      )}

      {opened && draft && (
        <Sheet title={`Ativar programa de ${clientName}?`} onClose={() => setOpened(false)}>
          <p className="muted">
            Os treinos ainda vazios desta versão serão criados como S1–S{draft.weeks} · Treino A/B/C. O programa ativo
            anterior (se houver) é arquivado como concluído.
          </p>
          <button className="btn primary block" onClick={() => { setOpened(false); activate(); }} disabled={busy}>
            {busy ? 'Ativando…' : 'Ativar'}
          </button>
        </Sheet>
      )}
    </section>
  );
}

function patchItem(p: Program, at: { week: number; day: number; index: number }, patch: (it: PlannedExercise) => PlannedExercise): Program {
  return {
    ...p,
    sessions: p.sessions.map((s) => {
      if (s.week !== at.week || s.dayIndex !== at.day) return s;
      const trainable = s.items.filter(isConvertableItem);
      const item = trainable[at.index];
      if (!item) return s;
      let k = -1;
      return {
        ...s,
        items: s.items.map((it) => {
          if (!isConvertableItem(it)) return it;
          k += 1;
          return k === at.index ? patch(it) : it;
        }),
      };
    }),
  };
}

function DraftReview({
  draft,
  exercises,
  busy,
  onChange,
  onSwap,
  onActivate,
  onCancel,
}: {
  draft: Program;
  exercises: Map<string, string>;
  busy: boolean;
  onChange: (p: Program) => void;
  onSwap: (at: { week: number; day: number; index: number }) => void;
  onActivate: () => void;
  onCancel: () => void;
}) {
  const [week, setWeek] = useState(1);
  const [edit, setEdit] = useState<{ week: number; day: number; index: number } | null>(null);
  const weeks = [...new Set(draft.sessions.map((s) => s.week))];
  const sessions = draft.sessions.filter((s) => s.week === week);

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>Rascunho · {draft.split}</h3>
          <span className="chip">{draft.sessions.length} sessões</span>
        </div>
        <p className="muted small">
          {draft.weeks} semanas · motor v{draft.engineVersion} · cada item traz o motivo; tudo é editável antes de ativar.
        </p>
      </div>

      <nav className="tabs">
        {weeks.map((w) => (
          <button key={w} className={w === week ? 'on' : ''} onClick={() => setWeek(w)}>
            Semana {w}
            {w % 4 === 0 && ' ⏬'}
          </button>
        ))}
      </nav>
      {week % 4 === 0 && (
        <p className="muted small center">Semana de deload: mesmos exercícios, menos esforço (RIR 4+).</p>
      )}

      {sessions.map((s) => {
        const trainable = s.items.filter(isConvertableItem);
        return (
          <div key={`${s.week}:${s.dayIndex}`} className="card">
            <div className="card-head">
              <h3>
                Treino {'ABCDEFG'[s.dayIndex] ?? s.dayIndex + 1} <small className="muted">· {s.minutes} min</small>
              </h3>
            </div>
            <ul className="list compact">
              {trainable.map((it, i) => {
                const name = exercises.get(it.exerciseId) ?? aliasName(it.exerciseId);
                return (
                  <li key={`${s.week}:${s.dayIndex}:${i}`}>
                    <button
                      className="list-item"
                      onClick={() => setEdit({ week: s.week, day: s.dayIndex, index: i })}
                    >
                      <span className="grow">
                        <b>
                          {name}{' '}
                          <small className="muted">
                            {it.sets}×{it.targetReps}
                            {it.loadKg != null ? ` · ${it.loadKg} kg` : ''} · RIR {it.targetRir}
                          </small>
                        </b>
                        <small className="muted">
                          {BLOCK_LABEL[it.block]} · descanso {it.restMin} min{it.pinned ? ' · 📌 fixado' : ''}
                        </small>
                        <small className="muted">💡 {reasonLabel(it.reason)}</small>
                      </span>
                      <span className="chev">›</span>
                    </button>
                    <div className="row gap-sm">
                      <button className="chip" onClick={() => onSwap({ week: s.week, day: s.dayIndex, index: i })}>
                        Trocar
                      </button>
                      <button
                        className="chip"
                        onClick={() =>
                          onChange(
                            patchItem(draft, { week: s.week, day: s.dayIndex, index: i }, (x) => ({ ...x, pinned: !x.pinned })),
                          )
                        }
                      >
                        {it.pinned ? 'Desafixar' : 'Fixar'}
                      </button>
                      <button
                        className="chip"
                        onClick={() => {
                          onChange(draftRemoveItemAt(draft, { week: s.week, day: s.dayIndex, index: i }));
                          setEdit(null);
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <div className="row gap">
        <button className="btn ghost grow" onClick={onCancel} disabled={busy}>
          Descartar rascunho
        </button>
        <button className="btn primary grow" onClick={onActivate} disabled={busy}>
          Ativar programa
        </button>
      </div>

      {edit && (
        <DoseSheet
          draft={draft}
          at={edit}
          onChange={(patch) => onChange(patchItem(draft, edit, patch))}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}

function DoseSheet({
  draft,
  at,
  onChange,
  onClose,
}: {
  draft: Program;
  at: { week: number; day: number; index: number };
  onChange: (patch: (it: PlannedExercise) => PlannedExercise) => void;
  onClose: () => void;
}) {
  const session = draft.sessions.find((s) => s.week === at.week && s.dayIndex === at.day);
  const it = session ? session.items.filter(isConvertableItem)[at.index] : undefined;
  if (!it) {
    onClose();
    return null;
  }
  return (
    <Sheet title="Editar dose" onClose={onClose}>
      <div className="stack">
        <Stepper label="Séries" value={it.sets} min={1} onChange={(v) => onChange((x) => ({ ...x, sets: v ?? 1 }))} />
        <Stepper label="Repetições alvo" value={it.targetReps} min={1} onChange={(v) => onChange((x) => ({ ...x, targetReps: v ?? 10 }))} />
        <Stepper label="Carga (kg)" step={0.5} value={it.loadKg} min={0} onChange={(v) => onChange((x) => ({ ...x, loadKg: v }))} />
        <Stepper
          label="Descanso (min)"
          step={0.5}
          value={it.restMin}
          min={0}
          onChange={(v) => onChange((x) => ({ ...x, restMin: v ?? 1 }))}
        />
        <Stepper label="RIR alvo" value={it.targetRir} min={0} onChange={(v) => onChange((x) => ({ ...x, targetRir: v ?? 3 }))} />
        <p className="muted small">Edições manuais valem; o motor justifica cada sugestão com base no histórico, não na intuição.</p>
      </div>
    </Sheet>
  );
}

function SwapSheet({
  clientId,
  draft,
  target,
  exercises,
  onPick,
  onClose,
}: {
  clientId: string;
  draft: Program;
  target: { week: number; day: number; index: number };
  exercises: Map<string, string>;
  onPick: (newId: string, loadable: boolean) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<{ id: string; name: string; reason: string; loadable: boolean }[] | null>(null);
  const session = draft.sessions.find((s) => s.week === target.week && s.dayIndex === target.day);
  const current = session ? session.items.filter(isConvertableItem)[target.index] : undefined;
  const currentId = current?.exerciseId;

  useEffect(() => {
    if (!currentId) return;
    let alive = true;
    draftSubstitutions(clientId, currentId).then((sugs) => {
      if (!alive) return;
      setOptions(
        sugs.map((s) => ({
          id: s.exercise.id,
          name: s.exercise.name,
          reason: reasonLabel(s.reason),
          loadable: s.exercise.loadable,
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, [clientId, currentId]);

  return (
    <Sheet title="Trocar exercício" onClose={onClose}>
      <p className="muted small">
        Substituindo <b>{current ? (exercises.get(current.exerciseId) ?? current.exerciseId) : '—'}</b>. Top-3 do motor,
        respeitando lesões e equipamento:
      </p>
      {!options ? (
        <p className="muted">Buscando…</p>
      ) : options.length === 0 ? (
        <p className="muted">Sem alternativa segura no equipamento atual.</p>
      ) : (
        <ul className="list">
          {options.map((o) => (
            <li key={o.id}>
              <button className="list-item" onClick={() => onPick(o.id, o.loadable)}>
                <span className="grow">
                  <b>{o.name}</b>
                  <small className="muted">💡 {o.reason}</small>
                </span>
                <span className="chev">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/** Ids internos do motor (aquecimento/resfriamento) → nome legível. */
const FALLBACK_NAMES: Record<string, string> = {
  'march-in-place': 'Corrida estacionária',
  'jump-rope': 'Pular corda',
  'glute-bridge': 'Elevação pélvica',
  'band-row': 'Remada com elástico',
  dead_bug: 'Dead bug',
  'supine-hamstring-stretch': 'Alongamento de isquiotibiais (deitado)',
};
function aliasName(id: string): string {
  return FALLBACK_NAMES[id] ?? id;
}
