import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExercisePicker } from '../components/ExercisePicker';
import { VideoRecorder } from '../components/VideoRecorder';
import { Sheet, Stepper } from '../components/ui';
import { db, uid, type Session, type SessionEntry, type SetLog } from '../lib/db';
import { newEntry, sessionSummaryText } from '../lib/session';
import { beep, fmtClock, fmtKg, shareText, unlockAudio, useNow, useWakeLock, vibrate } from '../lib/utils';

/** Timer de descanso ou de série cronometrada. Persistido para sobreviver a recarregamentos. */
interface Timer {
  kind: 'rest' | 'work';
  endsAt: number;
  total: number;
  entryKey: string;
  setIdx: number;
  /** Para pausa. */
  pausedLeft?: number;
}

const timerKey = (sid: string) => `mt-timer-${sid}`;
const idxKey = (sid: string) => `mt-idx-${sid}`;

function loadTimer(sid: string): Timer | null {
  try {
    const t = JSON.parse(localStorage.getItem(timerKey(sid)) ?? 'null') as Timer | null;
    return t && (t.pausedLeft != null || t.endsAt > Date.now() - 2000) ? t : null;
  } catch {
    return null;
  }
}

export function SessionPage() {
  const { sid = '' } = useParams();
  const session = useLiveQuery(() => db.sessions.get(sid), [sid]);
  if (session === undefined) return <div className="page dark" />;
  if (session === null || session.endedAt) return <SessionGone session={session ?? undefined} />;
  return <LiveSession session={session} />;
}

function SessionGone({ session }: { session?: Session }) {
  const nav = useNavigate();
  useEffect(() => {
    nav(session ? `/sessoes/${session.id}` : '/', { replace: true });
  }, [nav, session]);
  return null;
}

function LiveSession({ session }: { session: Session }) {
  const nav = useNavigate();
  const sid = session.id;
  const client = useLiveQuery(() => db.clients.get(session.clientId), [session.clientId]);
  const equipment = useLiveQuery(() => db.equipment.where('clientId').equals(session.clientId).toArray(), [session.clientId]);
  const videoCount = useLiveQuery(async () => {
    const m = new Map<string, number>();
    await db.videos.where('sessionId').equals(sid).each((v) => v.exerciseId && m.set(v.exerciseId, (m.get(v.exerciseId) ?? 0) + 1));
    return m;
  }, [sid]);

  const [idx, setIdxState] = useState(() => {
    const saved = Number(sessionStorage.getItem(idxKey(sid)));
    if (Number.isInteger(saved) && saved >= 0 && saved < session.entries.length) return saved;
    const firstOpen = session.entries.findIndex((e) => e.sets.some((s) => !s.done));
    return Math.max(0, firstOpen);
  });
  const setIdx = (i: number) => {
    setIdxState(i);
    sessionStorage.setItem(idxKey(sid), String(i));
  };
  const [timer, setTimerState] = useState<Timer | null>(() => loadTimer(sid));
  const setTimer = (t: Timer | null) => {
    setTimerState(t);
    if (t) localStorage.setItem(timerKey(sid), JSON.stringify(t));
    else localStorage.removeItem(timerKey(sid));
  };
  const [picking, setPicking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [editNote, setEditNote] = useState(false);

  useWakeLock(true);
  const now = useNow(true, timer ? 200 : 1000);

  const entries = session.entries;
  const entry: SessionEntry | undefined = entries[Math.min(idx, entries.length - 1)];
  const activeSetIdx = entry ? entry.sets.findIndex((s) => !s.done) : -1;

  const saveEntries = (next: SessionEntry[]) => db.sessions.update(sid, { entries: next });
  const patchEntry = (key: string, fn: (e: SessionEntry) => SessionEntry) => saveEntries(entries.map((e) => (e.key === key ? fn(e) : e)));
  const patchSet = (key: string, i: number, patch: Partial<SetLog>) =>
    patchEntry(key, (e) => ({ ...e, sets: e.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  // ----- timers -----
  const left = timer ? (timer.pausedLeft ?? (timer.endsAt - now) / 1000) : 0;
  const lastBeep = useRef<number | null>(null);
  const fired = useRef<number | null>(null);

  useEffect(() => {
    if (!timer || timer.pausedLeft != null) return;
    const secLeft = Math.ceil((timer.endsAt - now) / 1000);
    if (secLeft !== lastBeep.current) {
      const prep = timer.kind === 'work' ? secLeft - timer.total : 0;
      if ((secLeft >= 1 && secLeft <= 3) || (prep >= 1 && prep <= 3)) {
        beep(660, 120);
        vibrate(60);
      } else if (timer.kind === 'work' && prep === 0 && secLeft > 0) {
        beep(990, 300, 0.3); // valendo!
        vibrate(200);
      }
      lastBeep.current = secLeft;
    }
    if (now >= timer.endsAt && fired.current !== timer.endsAt) {
      fired.current = timer.endsAt;
      lastBeep.current = null;
      beep(990, 450, 0.35);
      vibrate([250, 100, 250]);
      onTimerEnd(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, timer]);

  const onTimerEnd = (t: Timer) => {
    if (t.kind === 'work') {
      // série cronometrada concluída → marca e inicia descanso
      const e = entries.find((x) => x.key === t.entryKey);
      if (e) completeSet(e, t.setIdx);
      else setTimer(null);
      return;
    }
    setTimer(null);
    // após o descanso da última série, avança para o próximo exercício
    const e = entries.find((x) => x.key === t.entryKey);
    if (e && e.sets.every((s) => s.done)) {
      const nextOpen = entries.findIndex((x) => x.sets.some((s) => !s.done));
      if (nextOpen >= 0) setIdx(nextOpen);
    }
  };

  const completeSet = (e: SessionEntry, i: number) => {
    unlockAudio();
    const st = e.sets[i];
    const sets = e.sets.map((s, j) => (j === i ? { ...s, done: true, completedAt: Date.now() } : s));
    // Propaga carga/reps alteradas para as séries seguintes ainda não feitas
    for (let j = i + 1; j < sets.length; j++) {
      if (!sets[j].done) sets[j] = { ...sets[j], weightKg: st.weightKg, reps: st.reps ?? sets[j].reps, durationSec: st.durationSec ?? sets[j].durationSec };
    }
    patchEntry(e.key, (x) => ({ ...x, sets }));
    const allDone = sets.every((s) => s.done);
    const isLastExercise = entries.every((x) => x.key === e.key || x.sets.every((s) => s.done));
    if (e.restSec > 0 && !(allDone && isLastExercise)) {
      setTimer({ kind: 'rest', endsAt: Date.now() + e.restSec * 1000, total: e.restSec, entryKey: e.key, setIdx: i });
    } else {
      setTimer(null);
      if (allDone) {
        const nextOpen = entries.findIndex((x) => x.key !== e.key && x.sets.some((s) => !s.done));
        if (nextOpen >= 0) setIdx(nextOpen);
      }
    }
  };

  const startWork = (e: SessionEntry, i: number) => {
    unlockAudio();
    const dur = e.sets[i].durationSec ?? 30;
    setTimer({ kind: 'work', endsAt: Date.now() + dur * 1000 + 3000, total: dur, entryKey: e.key, setIdx: i });
  };

  const adjustTimer = (deltaSec: number) => {
    if (!timer) return;
    if (timer.pausedLeft != null) setTimer({ ...timer, pausedLeft: Math.max(1, timer.pausedLeft + deltaSec) });
    else setTimer({ ...timer, endsAt: Math.max(Date.now() + 1000, timer.endsAt + deltaSec * 1000), total: Math.max(1, timer.total + deltaSec) });
  };
  const togglePause = () => {
    if (!timer) return;
    if (timer.pausedLeft != null) setTimer({ ...timer, endsAt: Date.now() + timer.pausedLeft * 1000, pausedLeft: undefined });
    else setTimer({ ...timer, pausedLeft: Math.max(0, (timer.endsAt - Date.now()) / 1000) });
  };

  const addExercise = async (exId: string) => {
    const ex = await db.exercises.get(exId);
    if (!ex) return;
    const history = (await db.sessions.where('clientId').equals(session.clientId).toArray())
      .filter((s) => s.endedAt)
      .sort((a, b) => b.startedAt - a.startedAt);
    const e = newEntry(ex, history);
    await saveEntries([...entries, e]);
    setIdx(entries.length);
  };

  const elapsed = (now - session.startedAt) / 1000;
  const doneSets = entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const totalSets = entries.reduce((a, e) => a + e.sets.length, 0);
  const eq = entry?.equipmentId ? equipment?.find((x) => x.id === entry.equipmentId) : undefined;
  const nextEntry = entries.find((x, j) => j !== idx && x.sets.some((s) => !s.done));
  const timerEntry = timer ? entries.find((x) => x.key === timer.entryKey) : undefined;
  const upcoming = (() => {
    // o que vem depois do descanso
    if (!timerEntry) return undefined;
    const ni = timerEntry.sets.findIndex((s) => !s.done);
    if (ni >= 0) return { name: timerEntry.exerciseName, set: timerEntry.sets[ni], n: ni + 1, mode: timerEntry.mode };
    const ne = entries.find((x) => x.sets.some((s) => !s.done));
    if (!ne) return undefined;
    const si = ne.sets.findIndex((s) => !s.done);
    return { name: ne.exerciseName, set: ne.sets[si], n: si + 1, mode: ne.mode };
  })();

  return (
    <div className="page dark session">
      <header className="session-top">
        <button className="icon-btn light" onClick={() => nav(`/clientes/${session.clientId}`)} aria-label="Voltar">
          ‹
        </button>
        <div className="grow">
          <div className="session-client">{client?.name}</div>
          <div className="session-meta">
            {session.workoutName} · {doneSets}/{totalSets} séries
          </div>
        </div>
        <div className="session-clock">{fmtClock(elapsed)}</div>
        <button className="btn sm primary" onClick={() => setFinishing(true)}>
          Finalizar
        </button>
      </header>

      <div className="progress">
        <div style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} />
      </div>

      {entries.length > 0 && (
        <nav className="ex-strip">
          {entries.map((e, i) => {
            const d = e.sets.filter((s) => s.done).length;
            return (
              <button key={e.key} className={`${i === idx ? 'on' : ''} ${d === e.sets.length ? 'done' : ''}`} onClick={() => setIdx(i)}>
                <span>{e.exerciseName}</span>
                <small>
                  {d}/{e.sets.length}
                </small>
              </button>
            );
          })}
          <button className="add" onClick={() => setPicking(true)}>
            +
          </button>
        </nav>
      )}

      <main className="session-main">
        {!entry ? (
          <div className="empty light">
            <p className="empty-title">Treino livre</p>
            <p className="muted">Adicione o primeiro exercício.</p>
            <button className="btn primary big" onClick={() => setPicking(true)}>
              + Adicionar exercício
            </button>
          </div>
        ) : (
          <>
            <div className="ex-head">
              <h2>{entry.exerciseName}</h2>
              <div className="row gap-sm">
                <button className="icon-btn light" onClick={() => setRecording(true)} aria-label="Gravar vídeo">
                  🎥{videoCount?.get(entry.exerciseId) ? <sup>{videoCount.get(entry.exerciseId)}</sup> : null}
                </button>
                <button className="icon-btn light" onClick={() => setEditNote(true)} aria-label="Observação">
                  📝
                </button>
              </div>
            </div>
            {entry.suggestion && <div className="suggestion">📈 {entry.suggestion}</div>}
            {eq && <div className="muted small">Equipamento: {eq.name}</div>}
            {entry.notes && <div className="ex-notes">{entry.notes}</div>}

            <ol className="sets">
              {entry.sets.map((s, i) => {
                const active = i === activeSetIdx;
                if (active) {
                  return (
                    <li key={i} className="set active">
                      <div className="set-n">Série {i + 1}</div>
                      <div className="grid2">
                        {entry.mode === 'tempo' ? (
                          <Stepper label="Duração (s)" step={5} value={s.durationSec} onChange={(v) => patchSet(entry.key, i, { durationSec: v })} />
                        ) : (
                          <Stepper label="Reps" value={s.reps} onChange={(v) => patchSet(entry.key, i, { reps: v })} />
                        )}
                        <WeightStepper value={s.weightKg} options={eq?.weights} onChange={(v) => patchSet(entry.key, i, { weightKg: v })} />
                      </div>
                      {entry.mode === 'reps' && (
                        <div className="set-rir">
                          <span className="muted small">RIR</span>
                          <div className="chips">
                            {([0, 1, 2, 3, 4] as const).map((r) => (
                              <button
                                key={r}
                                type="button"
                                className={`chip btn-chip ${s.rir === r ? 'on' : ''}`}
                                onClick={() => patchSet(entry.key, i, { rir: s.rir === r ? undefined : r })}
                              >
                                {r === 4 ? '4+' : r}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <PainPicker value={s.pain} onChange={(p) => patchSet(entry.key, i, { pain: p })} />
                      {s.pain && s.pain.score >= 4 && (
                        <div className="alert">
                          <b>⚠ Dor {s.pain.score}/10 em {s.pain.region}</b>
                          <p className="small">Encerre este exercício hoje. O motor propõe a regressão na próxima sessão.</p>
                        </div>
                      )}
                    </li>
                  );
                }
                return (
                  <li key={i} className={`set ${s.done ? 'done' : ''}`}>
                    <button
                      className="set-row"
                      onClick={() => {
                        if (s.done && confirm(`Desfazer série ${i + 1}?`)) patchSet(entry.key, i, { done: false, completedAt: undefined });
                      }}
                    >
                      <span className="set-n">{i + 1}</span>
                      <span className="grow">
                        {entry.mode === 'tempo' ? `${s.durationSec ?? '—'} s` : `${s.reps ?? '—'} reps`}
                        {s.weightKg ? ` · ${fmtKg(s.weightKg)}` : ''}
                        {s.rir != null ? ` · RIR ${s.rir === 4 ? '4+' : s.rir}` : ''}
                        {s.pain ? ` · ⚠${s.pain.score}` : ''}
                      </span>
                      <span>{s.done ? '✓' : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="row gap">
              <button
                className="btn ghost light sm grow"
                onClick={() => {
                  const last = entry.sets[entry.sets.length - 1];
                  patchEntry(entry.key, (e) => ({ ...e, sets: [...e.sets, { ...last, done: false, completedAt: undefined }] }));
                }}
              >
                + Série
              </button>
              {entry.sets.length > 1 && activeSetIdx !== -1 && (
                <button
                  className="btn ghost light sm grow"
                  onClick={() => patchEntry(entry.key, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))}
                  disabled={entry.sets[entry.sets.length - 1].done}
                >
                  − Série
                </button>
              )}
              <RestSelect value={entry.restSec} onChange={(v) => patchEntry(entry.key, (e) => ({ ...e, restSec: v }))} />
            </div>

            {activeSetIdx === -1 && (
              <div className="done-msg">
                ✓ Exercício concluído
                {nextEntry && (
                  <button className="btn primary block big" onClick={() => setIdx(entries.indexOf(nextEntry))}>
                    Próximo: {nextEntry.exerciseName} ›
                  </button>
                )}
                {!nextEntry && (
                  <button className="btn primary block big" onClick={() => setFinishing(true)}>
                    Finalizar sessão
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Barra de ação / timer fixa embaixo — alvo grande para o polegar */}
      <footer className="session-foot">
        {timer ? (
          <div className={`timer ${timer.kind}`}>
            <div className="timer-bar">
              <div style={{ width: `${Math.min(100, Math.max(0, (1 - left / timer.total) * 100))}%` }} />
            </div>
            <div className="timer-row">
              <button className="icon-btn light" onClick={() => adjustTimer(-15)} aria-label="Menos 15 segundos">
                −15
              </button>
              <div className="timer-center" onClick={togglePause}>
                <div className="timer-label">
                  {timer.kind === 'rest' ? 'Descanso' : left > timer.total ? 'Prepare-se' : 'Valendo!'}
                  {timer.pausedLeft != null && ' · pausado'}
                </div>
                <div className="timer-value">{left > timer.total && timer.kind === 'work' ? Math.ceil(left - timer.total) : fmtClock(Math.ceil(Math.min(left, timer.total)))}</div>
              </div>
              <button className="icon-btn light" onClick={() => adjustTimer(15)} aria-label="Mais 15 segundos">
                +15
              </button>
            </div>
            {timer.kind === 'rest' && upcoming && (
              <div className="timer-next">
                Próximo: <b>{upcoming.name}</b> — série {upcoming.n}:{' '}
                {upcoming.mode === 'tempo' ? `${upcoming.set.durationSec}s` : `${upcoming.set.reps ?? '?'} reps`}
                {upcoming.set.weightKg ? ` · ${fmtKg(upcoming.set.weightKg)}` : ''}
              </div>
            )}
            <button
              className="btn ghost light block"
              onClick={() => {
                if (timer.kind === 'work') {
                  const e = entries.find((x) => x.key === timer.entryKey);
                  if (e) {
                    const elapsedWork = Math.round(timer.total - Math.max(0, Math.min(left, timer.total)));
                    completeSet({ ...e, sets: e.sets.map((s, j) => (j === timer.setIdx ? { ...s, durationSec: Math.max(1, elapsedWork) } : s)) }, timer.setIdx);
                  } else setTimer(null);
                } else onTimerEnd(timer);
              }}
            >
              {timer.kind === 'rest' ? 'Pular descanso' : 'Encerrar série agora'}
            </button>
          </div>
        ) : entry && activeSetIdx >= 0 ? (
          entry.mode === 'tempo' ? (
            <button className="btn go block huge" onClick={() => startWork(entry, activeSetIdx)}>
              ▶ Iniciar série {activeSetIdx + 1} · {entry.sets[activeSetIdx].durationSec ?? 30}s
            </button>
          ) : (
            <button className="btn go block huge" onClick={() => completeSet(entry, activeSetIdx)}>
              ✓ Série {activeSetIdx + 1} feita
            </button>
          )
        ) : null}
      </footer>

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(ex) => {
            setPicking(false);
            addExercise(ex.id);
          }}
        />
      )}

      {recording && entry && (
        <VideoRecorder
          title={entry.exerciseName}
          onClose={() => setRecording(false)}
          onSave={async (blob, mimeType, durationSec, note) => {
            await db.videos.add({
              id: uid(),
              clientId: session.clientId,
              sessionId: sid,
              exerciseId: entry.exerciseId,
              exerciseName: entry.exerciseName,
              blob,
              mimeType,
              durationSec,
              note: note || undefined,
              createdAt: Date.now(),
            });
          }}
        />
      )}

      {editNote && entry && (
        <NoteSheet
          title={entry.exerciseName}
          value={entry.notes ?? ''}
          onClose={() => setEditNote(false)}
          onSave={(v) => {
            patchEntry(entry.key, (e) => ({ ...e, notes: v || undefined }));
            setEditNote(false);
          }}
        />
      )}

      {finishing && (
        <FinishSheet
          session={session}
          clientName={client?.name ?? ''}
          onClose={() => setFinishing(false)}
          onDone={() => {
            localStorage.removeItem(timerKey(sid));
            sessionStorage.removeItem(idxKey(sid));
          }}
        />
      )}
    </div>
  );
}

function PainPicker({
  value,
  onChange,
}: {
  value?: { region: import('../lib/db').BodyRegion; score: number };
  onChange: (p: { region: import('../lib/db').BodyRegion; score: number } | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<import('../lib/db').BodyRegion>(value?.region ?? 'knee');
  const REGIONS: { id: import('../lib/db').BodyRegion; label: string }[] = [
    { id: 'spine', label: 'Coluna' },
    { id: 'shoulder', label: 'Ombro' },
    { id: 'elbow', label: 'Cotovelo' },
    { id: 'wrist', label: 'Punho' },
    { id: 'hip', label: 'Quadril' },
    { id: 'knee', label: 'Joelho' },
    { id: 'ankle', label: 'Tornozelo' },
  ];
  return (
    <div className="set-pain">
      <button type="button" className={`btn ghost light sm ${value ? 'warn' : ''}`} onClick={() => setOpen((o) => !o)}>
        {value ? `⚠ Dor ${value.score}/10 (${REGIONS.find((r) => r.id === value.region)?.label})` : '⚠ Registrar dor'}
      </button>
      {open && (
        <div className="stack">
          <div className="chips">
            {REGIONS.map((r) => (
              <button key={r.id} type="button" className={`chip btn-chip ${region === r.id ? 'on' : ''}`} onClick={() => setRegion(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="chips">
            {Array.from({ length: 11 }, (_, n) => n).map((n) => (
              <button
                key={n}
                type="button"
                className={`chip btn-chip ${value?.region === region && value.score === n ? 'on' : ''}`}
                onClick={() => {
                  onChange({ region, score: n });
                  setOpen(false);
                }}
              >
                {n}
              </button>
            ))}
            <button type="button" className="chip btn-chip" onClick={() => { onChange(undefined); setOpen(false); }}>
              limpar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WeightStepper({ value, options, onChange }: { value?: number; options?: number[]; onChange: (v: number | undefined) => void }) {
  if (!options?.length) return <Stepper label="Carga (kg)" step={0.5} value={value} onChange={(v) => onChange(v || undefined)} />;
  // Com equipamento cadastrado, os botões saltam entre as cargas disponíveis
  const v = value ?? 0;
  const down = [...options].reverse().find((w) => w < v - 1e-9);
  const up = options.find((w) => w > v + 1e-9);
  return (
    <div className="stepper">
      <span className="stepper-label">Carga (kg)</span>
      <div className="stepper-row">
        <button type="button" onClick={() => onChange(down)} aria-label="Carga menor">
          −
        </button>
        <input inputMode="decimal" value={value ?? ''} placeholder="—" onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value.replace(',', '.')) || undefined)} />
        <button type="button" onClick={() => up != null && onChange(up)} aria-label="Carga maior">
          +
        </button>
      </div>
    </div>
  );
}

function RestSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const opts = [0, 30, 45, 60, 75, 90, 120, 150, 180];
  if (!opts.includes(value)) opts.push(value);
  return (
    <select className="input sm dark-input grow" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Descanso">
      {opts
        .sort((a, b) => a - b)
        .map((o) => (
          <option key={o} value={o}>
            {o === 0 ? '⏱ sem' : `⏱ ${fmtClock(o)}`}
          </option>
        ))}
    </select>
  );
}

function NoteSheet({ title, value, onSave, onClose }: { title: string; value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  return (
    <Sheet title={`Observação — ${title}`} onClose={onClose}>
      <textarea className="input" rows={4} autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Ex.: sentiu o ombro E, reduzir amplitude" />
      <button className="btn primary block" onClick={() => onSave(v.trim())}>
        Salvar
      </button>
    </Sheet>
  );
}

function FinishSheet({ session, clientName, onClose, onDone }: { session: Session; clientName: string; onClose: () => void; onDone: () => void }) {
  const nav = useNavigate();
  const [rpe, setRpe] = useState<number | undefined>(session.rpe);
  const [notes, setNotes] = useState(session.notes ?? '');
  const pending = session.entries.reduce((a, e) => a + e.sets.filter((s) => !s.done).length, 0);

  const finish = async (share: boolean) => {
    // Remove séries não realizadas para o histórico refletir o que foi feito de fato
    const entries = session.entries.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length);
    const final: Session = { ...session, entries, rpe, notes: notes.trim() || undefined, endedAt: Date.now() };
    await db.sessions.put(final);
    onDone();
    if (share) await shareText(sessionSummaryText(final, clientName), `Treino — ${clientName}`);
    nav(`/sessoes/${session.id}`, { replace: true });
  };

  return (
    <Sheet title="Finalizar sessão" onClose={onClose}>
      {pending > 0 && <p className="alert">{pending} séries não marcadas serão descartadas do histórico.</p>}
      <div className="field">
        <span>Esforço percebido (PSE 1–10)</span>
        <div className="rpe">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className={rpe === n ? 'on' : ''} onClick={() => setRpe(rpe === n ? undefined : n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Observações da sessão</span>
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Como o cliente estava, dores, evolução…" />
      </label>
      <button className="btn primary block big" onClick={() => finish(false)}>
        Salvar e encerrar
      </button>
      <button className="btn block" onClick={() => finish(true)}>
        Salvar e enviar resumo ao cliente
      </button>
      <button
        className="btn danger block"
        onClick={async () => {
          if (!confirm('Descartar esta sessão? Os vídeos gravados nela serão mantidos.')) return;
          await db.sessions.delete(session.id);
          onDone();
          nav(`/clientes/${session.clientId}`, { replace: true });
        }}
      >
        Descartar sessão
      </button>
    </Sheet>
  );
}
