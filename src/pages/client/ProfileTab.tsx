import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field, Sheet } from '../../components/ui';
import { db, deleteClient, uid, type Assessment, type Client, type ClientPrefs, type FitnessLevel, type InjuryRecord, type InjuryStatus, type ParqResult } from '../../lib/db';
import { CONDITION_PRESETS, INJURY_STATUS_LABEL } from '../../lib/engineAdapter';
import { PARQ_GENERAL, PARQ_SECTIONS, parqFollowUpPositive, parqPositive } from '../../lib/parq';
import { BATTERY, est1rm, fromDrafts, toDrafts, type TestDraft } from '../../lib/benchmarks';
import type { Goal } from '../../engine/types';
import { ageFrom, fmtDate, num, todayISO } from '../../lib/utils';

const REGION_LABEL: Record<string, string> = {
  spine: 'Coluna',
  shoulder: 'Ombro',
  elbow: 'Cotovelo',
  wrist: 'Punho',
  hip: 'Quadril',
  knee: 'Joelho',
  ankle: 'Tornozelo',
};

const GOAL_LABEL: Record<Goal, string> = {
  strength: 'Força',
  hypertrophy: 'Hipertrofia',
  'fat-loss': 'Perda de gordura',
  'general-fitness': 'Condicionamento geral',
  endurance: 'Resistência muscular',
  'mobility-rehab': 'Mobilidade / reabilitação',
};

const LEVEL: Record<FitnessLevel, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
};

export function ProfileTab({ client }: { client: Client }) {
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [assessing, setAssessing] = useState<Assessment | 'new' | null>(null);
  const [injury, setInjury] = useState<InjuryRecord | 'new' | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [parqOpen, setParqOpen] = useState<ParqResult | 'new' | null>(null);
  const injuries = useLiveQuery(() => db.injuries.where('clientId').equals(client.id).toArray(), [client.id]);
  const assessments = useLiveQuery(
    async () => (await db.assessments.where('clientId').equals(client.id).toArray()).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)),
    [client.id],
  );
  const cur = assessments?.[0];
  const prev = assessments?.[1];
  const bmi = cur?.weightKg && cur?.heightCm ? cur.weightKg / (cur.heightCm / 100) ** 2 : undefined;
  const age = ageFrom(client.birthDate);
  const delta = cur?.weightKg != null && prev?.weightKg != null ? cur.weightKg - prev.weightKg : undefined;

  // Benchmarks ao longo do tempo (mais antigo -> mais recente), por teste da bateria.
  const benchSeries = useMemo(() => {
    const byTest: Record<string, { date: string; e1: number }[]> = {};
    const list = [...(assessments ?? [])].sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
    for (const a of list) {
      for (const t of a.benchmarks?.repTests ?? []) {
        (byTest[t.exerciseId] ??= []).push({ date: a.date, e1: est1rm(t.loadKg, t.reps, t.rir) });
      }
    }
    return byTest;
  }, [assessments]);
  const hasBenchmarks = Object.values(benchSeries).some((s) => s.length > 0);

  return (
    <section className="stack">
      <div className="card">
        <div className="card-head">
          <h3>Estado físico atual</h3>
          <button className="btn sm" onClick={() => setAssessing('new')}>
            + Avaliação
          </button>
        </div>
        {cur ? (
          <>
            <p className="muted small">Avaliação de {fmtDate(cur.date)}</p>
            <div className="stats">
              <Stat label="Peso" value={cur.weightKg} unit="kg" extra={delta != null && delta !== 0 ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : undefined} />
              <Stat label="Altura" value={cur.heightCm} unit="cm" />
              <Stat label="IMC" value={bmi && Math.round(bmi * 10) / 10} />
              <Stat label="Gordura" value={cur.bodyFatPct} unit="%" />
              <Stat label="Cintura" value={cur.waistCm} unit="cm" />
              <Stat label="FC repouso" value={cur.restingHr} unit="bpm" />
              {cur.bloodPressure && <Stat label="Pressão" value={cur.bloodPressure} />}
              {age != null && <Stat label="Idade" value={age} unit="anos" />}
              {cur.fitnessLevel && <Stat label="Nível" value={LEVEL[cur.fitnessLevel]} />}
              {cur.monthsTraining != null && <Stat label="Experiência" value={cur.monthsTraining} unit="meses" />}
            </div>
            {cur.injuries && (
              <div className="alert">
                <b>⚠ Lesões / restrições</b>
                <p>{cur.injuries}</p>
              </div>
            )}
            {cur.notes && <p className="pre">{cur.notes}</p>}
          </>
        ) : (
          <p className="muted">Nenhuma avaliação ainda. Registre peso, medidas, lesões e nível de condicionamento.</p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Lesões e condições</h3>
          <button className="btn sm" onClick={() => setInjury('new')}>
            + Lesão
          </button>
        </div>
        {injuries && injuries.length > 0 ? (
          <>
            {injuries.some((i) => i.status !== 'cleared' && !i.clearedAt && (i.status === 'acute' || i.severity === 3)) && (
              <div className="alert">
                <b>⚠ Geração de planos bloqueada</b>
                <p className="small">
                  Condição aguda ou gravidade 3 sem liberação registrada. Registre a liberação (com data) para o motor gerar planos; a região fica como
                  "escolha manual do treinador".
                </p>
              </div>
            )}
            <ul className="list compact">
              {injuries.map((i) => (
                <li key={i.id}>
                  <button className="list-item" onClick={() => setInjury(i)}>
                    <span className="grow">
                      <b>
                        {CONDITION_PRESETS.find((p) => p.id === i.condition)?.label ?? i.condition} · {INJURY_STATUS_LABEL[i.status]}
                      </b>
                      <small className="muted">
                        {['spine','shoulder','elbow','wrist','hip','knee','ankle'].includes(i.region) ? REGION_LABEL[i.region] : i.region} · gravidade {i.severity}
                        {i.clearedAt ? ` · liberada ${fmtDate(i.clearedAt)}` : ''}
                      </small>
                      {i.painMoves && i.painMoves.length > 0 && (
                        <small className="muted">Dói: {i.painMoves.join(', ')}</small>
                      )}
                    </span>
                    <span className="chev">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">Nenhuma lesão estruturada. O texto livre da avaliação continua valendo como nota.</p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Benchmarks — evolução de força</h3>
          {cur && (
            <button
              className="btn sm"
              onClick={() => setAssessing({ ...cur, id: uid(), date: todayISO(), benchmarks: undefined, notes: undefined })}
            >
              + Reteste
            </button>
          )}
        </div>
        {hasBenchmarks ? (
          <div className="stats">
            {BATTERY.map((t) => {
              const s = benchSeries[t.engineId] ?? [];
              const last = s[s.length - 1];
              const before = s.length > 1 ? s[s.length - 2] : undefined;
              const d = last && before ? last.e1 - before.e1 : undefined;
              return (
                <Stat
                  key={t.engineId}
                  label={t.name}
                  value={last ? Math.round(last.e1) : undefined}
                  unit="kg e1RM"
                  extra={d != null && d !== 0 ? `${d > 0 ? '+' : ''}${d.toFixed(1)} vs. ${fmtDate(before!.date)}` : last ? 'primeiro teste' : undefined}
                />
              );
            })}
          </div>
        ) : (
          <p className="muted small">
            Nenhum teste registrado. Preencha a bateria de testes numa avaliação para o motor semear as cargas e para os retestes mostrarem a evolução aqui.
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Preferências de treino</h3>
          <button className="btn sm" onClick={() => setPrefsOpen(true)}>
            Editar
          </button>
        </div>
        {client.prefs ? (
          <div className="stats">
            <Stat label="Treinos/semana" value={client.prefs.daysPerWeek} unit="×" />
            <Stat label="Duração" value={client.prefs.sessionMin} unit="min" />
            <Stat label="Impacto" value={client.prefs.noJump ? 'Sem saltos' : 'Livre'} />
            {client.prefs.focus.length > 0 && <Stat label="Focos" value={client.prefs.focus.join(', ')} />}
            {client.prefs.likes.length > 0 && <Stat label="Gosta" value={client.prefs.likes.length} unit="exercícios" />}
            {client.prefs.dislikes.length > 0 && <Stat label="Evita" value={client.prefs.dislikes.length} unit="exercícios" />}
          </div>
        ) : (
          <p className="muted small">
            Padrões: 3×/semana, 55 min, com saltos. Defina para o motor calibrar split e orçamento de tempo.
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>PAR-Q+ 2022</h3>
          <button className="btn sm" onClick={() => setParqOpen('new')}>
            Responder
          </button>
        </div>
        {cur?.parq ? (
          parqPositive(cur.parq) ? (
            <div className="alert">
              <b>⚠ SIM no PAR-Q+ ({fmtDate(cur.parq.filledAt)})</b>
              <p className="small">
                Portão de segurança ativo: o motor não gera programas até haver liberação registrada (médico ou
                profissional de exercício qualificado, com data).
                {parqFollowUpPositive(cur.parq) && ' Há também condições de acompanhamento marcadas (páginas 2-3).'}
              </p>
            </div>
          ) : (
            <p className="muted small">✅ Liberado para atividade física ({fmtDate(cur.parq.filledAt)}). Válido por 12 meses ou até mudança de saúde.</p>
          )
        ) : (
          <p className="muted small">Questionário oficial de prontidão para atividade física. Sempre que houver um SIM, registre a liberação antes de gerar planos.</p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Dados do cliente</h3>
          <button className="btn sm" onClick={() => setEditing(true)}>
            Editar
          </button>
        </div>
        <dl className="dl">
          {client.phone && (
            <>
              <dt>Telefone</dt>
              <dd>
                <a href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                  {client.phone}
                </a>
              </dd>
            </>
          )}
          {client.address && (
            <>
              <dt>Endereço</dt>
              <dd>
                <a href={`https://maps.google.com/?q=${encodeURIComponent(client.address)}`} target="_blank" rel="noreferrer">
                  {client.address}
                </a>
              </dd>
            </>
          )}
          {client.birthDate && (
            <>
              <dt>Nascimento</dt>
              <dd>{fmtDate(client.birthDate)}</dd>
            </>
          )}
          {client.goals && (
            <>
              <dt>Objetivos</dt>
              <dd className="pre">{client.goals}</dd>
            </>
          )}
          {client.notes && (
            <>
              <dt>Observações</dt>
              <dd className="pre">{client.notes}</dd>
            </>
          )}
        </dl>
      </div>

      {assessments && assessments.length > 1 && (
        <div className="card">
          <h3>Histórico de avaliações</h3>
          <ul className="list compact">
            {assessments.map((a) => (
              <li key={a.id}>
                <button className="list-item" onClick={() => setAssessing(a)}>
                  <span className="grow">
                    <b>{fmtDate(a.date)}</b>
                    <small className="muted">
                      {[a.weightKg && `${a.weightKg} kg`, a.bodyFatPct && `${a.bodyFatPct}% gordura`, a.waistCm && `cintura ${a.waistCm} cm`]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </small>
                  </span>
                  <span className="chev">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row gap">
        <button
          className="btn ghost grow"
          onClick={() => db.clients.update(client.id, { archived: !client.archived })}
        >
          {client.archived ? 'Reativar cliente' : 'Arquivar cliente'}
        </button>
        <button
          className="btn danger grow"
          onClick={async () => {
            if (!confirm(`Excluir ${client.name} e TODOS os treinos, sessões e vídeos? Isto não pode ser desfeito.`)) return;
            await deleteClient(client.id);
            nav('/');
          }}
        >
          Excluir
        </button>
      </div>

      {editing && <EditClientSheet client={client} onClose={() => setEditing(false)} />}
      {injury && (
        <InjurySheet
          clientId={client.id}
          existing={injury === 'new' ? undefined : injury}
          onClose={() => setInjury(null)}
        />
      )}
      {assessing && (
        <AssessmentSheet
          clientId={client.id}
          existing={assessing === 'new' ? undefined : assessing}
          template={cur}
          onClose={() => setAssessing(null)}
        />
      )}
      {prefsOpen && (
        <PrefsSheet client={client} onClose={() => setPrefsOpen(false)} />
      )}
      {parqOpen && (
        <PARQSheet
          client={client}
          latestId={cur?.id}
          latestDate={cur?.date}
          existing={parqOpen === 'new' ? undefined : parqOpen}
          onClose={() => setParqOpen(null)}
        />
      )}
    </section>
  );
}

function PrefsSheet({ client, onClose }: { client: Client; onClose: () => void }) {
  const [daysPerWeek, setDays] = useState(client.prefs?.daysPerWeek ?? 3);
  const [sessionMin, setMin] = useState(client.prefs?.sessionMin ?? 55);
  const [noJump, setNoJump] = useState(client.prefs?.noJump ?? false);
  const [focus, setFocus] = useState<string[]>(client.prefs?.focus ?? []);
  const [likes, setLikes] = useState<string[]>(client.prefs?.likes ?? []);
  const [dislikes, setDislikes] = useState<string[]>(client.prefs?.dislikes ?? []);
  // Exercícios que o gerador consegue escolher (tag de padrão, sem alongamentos).
  const exList = useLiveQuery(
    () => db.exercises.filter((e) => e.pattern !== undefined && e.role !== 'stretch').toArray(),
    [],
  );
  const nameOf = (id: string) => exList?.find((x) => x.id === id)?.name ?? id;
  const FOCUS_OPTIONS = ['glutes', 'quads', 'pecs', 'mid-back', 'core', 'hamstrings', 'delts', 'hip-flexors'];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const prefs: ClientPrefs = {
      daysPerWeek: Math.min(6, Math.max(1, daysPerWeek)),
      sessionMin: Math.min(120, Math.max(20, sessionMin)),
      noJump,
      focus,
      likes,
      dislikes,
    };
    await db.clients.update(client.id, { prefs });
    onClose();
  };

  return (
    <Sheet title="Preferências de treino" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <Field label="Treinos por semana" hint="Define o split: 1-2 full body A/B · 3 full body A/B/C · 4+ supra/infrah.">
          <div className="chips">
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <button key={d} type="button" className={`chip btn-chip ${daysPerWeek === d ? 'on' : ''}`} onClick={() => setDays(d)}>
                {d}×
              </button>
            ))}
          </div>
        </Field>
        <Field label={`Duração da sessão: ${sessionMin} min`} hint="Orçamento de tempo: o motor corta acessórios antes do principal.">
          <input
            className="input"
            type="range"
            min={20}
            max={120}
            step={5}
            value={sessionMin}
            onChange={(e) => setMin(Number(e.target.value))}
          />
        </Field>
        <Field label="Sem saltos / barulho" hint="Apartamento: o motor filtra corda, polichinelo e impactos.">
          <button type="button" className={`chip btn-chip ${noJump ? 'on' : ''}`} onClick={() => setNoJump(!noJump)}>
            {noJump ? 'Sim, sem impactos' : 'Não, impactos liberados'}
          </button>
        </Field>
        <Field label="Focos musculares">
          <div className="chips">
            {FOCUS_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip btn-chip ${focus.includes(m) ? 'on' : ''}`}
                onClick={() => setFocus((f) => (f.includes(m) ? f.filter((x) => x !== m) : [...f, m]))}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
        {(
          [
            { label: 'Gosta de fazer', hint: 'O motor pontua estes acima na seleção de exercícios (+10).', list: likes, setList: (fn: (l: string[]) => string[]) => setLikes(fn) },
            { label: 'Prefere evitar', hint: 'O motor evita estes na seleção (−25) e busca substitutos.', list: dislikes, setList: (fn: (l: string[]) => string[]) => setDislikes(fn) },
          ] as const
        ).map(({ label, hint, list, setList }) => (
          <Field key={label} label={label} hint={hint}>
            <div className="chips">
              {list.map((id) => (
                <button key={id} type="button" className="chip btn-chip on" onClick={() => setList((l) => l.filter((x) => x !== id))}>
                  {nameOf(id)} ✕
                </button>
              ))}
              <select className="input" value="" onChange={(e) => { if (e.target.value) setList((l) => [...new Set([...l, e.target.value])]); }}>
                <option value="">{list.length === 0 ? 'Adicionar exercício…' : '+ Adicionar…'}</option>
                {(exList ?? []).filter((e) => !list.includes(e.id)).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          </Field>
        ))}
        <button className="btn primary block">Salvar</button>
      </form>
    </Sheet>
  );
}

function PARQSheet({
  client,
  latestId,
  latestDate,
  existing,
  onClose,
}: {
  client: Client;
  latestId?: string;
  latestDate?: string;
  existing?: ParqResult;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no'>>(existing?.answers ?? {});
  const [conditions, setConditions] = useState(existing?.conditions ?? '');
  const [signedBy, setSignedBy] = useState(existing?.signedBy ?? client.name);
  const anyGeneral = parqPositive({ answers, filledAt: 0 });
  const set = (id: string, v: 'yes' | 'no') => setAnswers((a) => ({ ...a, [id]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parq: ParqResult = {
      answers,
      conditions: conditions.trim() || undefined,
      signedBy: signedBy.trim() || undefined,
      filledAt: Date.now(),
    };
    const today = latestDate === todayISO();
    if (latestId && today) {
      await db.assessments.update(latestId, { parq });
    } else {
      await db.assessments.add({
        id: uid(),
        clientId: client.id,
        date: todayISO(),
        parq,
        createdAt: Date.now(),
      });
    }
    onClose();
  };

  return (
    <Sheet title="PAR-Q+ 2022" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <p className="muted small">
          Participar de atividade física é seguro para a MAIORIA das pessoas. Este questionário indica se é necessário
          buscar orientação médica ou de um profissional de exercício qualificado antes de ficar mais ativo. Responda
          honestamente; a liberação vale por 12 meses ou até a condição mudar.
        </p>
        {PARQ_GENERAL.map((q) => (
          <Field key={q.id} label={q.text}>
            <div className="chips">
              <button type="button" className={`chip btn-chip ${answers[q.id] === 'yes' ? 'on' : ''}`} onClick={() => set(q.id, 'yes')}>
                Sim
              </button>
              <button type="button" className={`chip btn-chip ${answers[q.id] === 'no' ? 'on' : ''}`} onClick={() => set(q.id, 'no')}>
                Não
              </button>
            </div>
          </Field>
        ))}
        {(answers.g4 === 'yes' || answers.g6 === 'yes') && (
          <Field label="Condições listadas nas questões 4 e 6">
            <textarea className="input" rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Ex.: hipertensão controlada; tendinopatia no ombro direito" />
          </Field>
        )}
        {anyGeneral && (
          <>
            <p className="muted small">
              Você marcou SIM. Responda as condições de acompanhamento abaixo (páginas 2-3 do formulário oficial):
            </p>
            {PARQ_SECTIONS.map((s) => (
              <div key={s.id} className="card">
                <Field label={s.condition ?? s.title ?? ""}>
                  <div className="chips">
                    <button type="button" className={`chip btn-chip ${answers[s.id] === 'yes' ? 'on' : ''}`} onClick={() => set(s.id, 'yes')}>
                      Sim
                    </button>
                    <button
                      type="button"
                      className={`chip btn-chip ${answers[s.id] === 'no' ? 'on' : ''}`}
                      onClick={() => {
                        set(s.id, 'no');
                        setAnswers((a) => {
                          const clean = { ...a };
                          for (const q of s.questions) delete clean[q.id];
                          return clean;
                        });
                      }}
                    >
                      Não
                    </button>
                  </div>
                </Field>
                {answers[s.id] === 'yes' &&
                  s.questions.map((q) => (
                    <Field key={q.id} label={q.text}>
                      <div className="chips">
                        <button type="button" className={`chip btn-chip ${answers[q.id] === 'yes' ? 'on' : ''}`} onClick={() => set(q.id, 'yes')}>
                          Sim
                        </button>
                        <button type="button" className={`chip btn-chip ${answers[q.id] === 'no' ? 'on' : ''}`} onClick={() => set(q.id, 'no')}>
                          Não
                        </button>
                      </div>
                    </Field>
                  ))}
              </div>
            ))}
            <div className="alert">
              <b>Recomendação oficial</b>
              <p className="small">
                Com SIM nas páginas 2-3, procure orientação antes de aumentar a atividade: complete o ePARmed-X+
                (eparmedx.com) e/ou consulte um profissional de exercício qualificado. Adie o início se houver doença
                temporária (gripe/febre), gravidez ou mudança na saúde.
              </p>
            </div>
          </>
        )}
        <Field label="Assinado por" hint="Declaração do formulário: li, entendi e respondi; a liberação vale 12 meses ou até mudar a condição.">
          <input className="input" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} />
        </Field>
        <button className="btn primary block">Salvar PAR-Q+</button>
      </form>
    </Sheet>
  );
}

function EditClientSheet({ client, onClose }: { client: Client; onClose: () => void }) {
  const [f, setF] = useState(client);
  const set = (k: keyof Client) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title="Editar cliente" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!f.name.trim()) return;
          await db.clients.put({ ...f, name: f.name.trim() });
          onClose();
        }}
      >
        <Field label="Nome">
          <input className="input" value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Telefone / WhatsApp">
          <input className="input" type="tel" value={f.phone ?? ''} onChange={set('phone')} />
        </Field>
        <Field label="Endereço do treino">
          <input className="input" value={f.address ?? ''} onChange={set('address')} />
        </Field>
        <Field label="Data de nascimento">
          <input className="input" type="date" value={f.birthDate ?? ''} onChange={set('birthDate')} />
        </Field>
        <Field label="Objetivo principal">
          <select
            className="input"
            value={f.goal?.primary ?? ''}
            onChange={(e) => setF({ ...f, goal: e.target.value ? { ...(f.goal ?? {}), primary: e.target.value as Goal } : undefined })}
          >
            <option value="">— (usar texto livre abaixo)</option>
            {Object.entries(GOAL_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Objetivos (notas)">
          <textarea className="input" rows={2} value={f.goals ?? ''} onChange={set('goals')} />
        </Field>
        <Field label="Observações">
          <textarea className="input" rows={3} value={f.notes ?? ''} onChange={set('notes')} placeholder="Horários, preferências, como entrar no prédio…" />
        </Field>
        <button className="btn primary block">Salvar</button>
      </form>
    </Sheet>
  );
}

function InjurySheet({
  clientId,
  existing,
  onClose,
}: {
  clientId: string;
  existing?: InjuryRecord;
  onClose: () => void;
}) {
  const src = existing;
  const [condition, setCondition] = useState(src?.condition ?? CONDITION_PRESETS[0]!.id);
  const [severity, setSeverity] = useState<1 | 2 | 3>(src?.severity ?? 1);
  const [status, setStatus] = useState<InjuryStatus>(src?.status ?? 'chronic');
  const [painMoves, setPainMoves] = useState(src?.painMoves?.join(', ') ?? '');
  const [notes, setNotes] = useState(src?.notes ?? '');
  const [clearedAt, setClearedAt] = useState(src?.clearedAt ?? '');
  const region = CONDITION_PRESETS.find((p) => p.id === condition)?.region ?? 'spine';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const rec: InjuryRecord = {
      id: src?.id ?? uid(),
      clientId,
      region,
      condition,
      severity,
      status,
      painMoves: painMoves.split(',').map((s) => s.trim()).filter(Boolean),
      notes: notes.trim() || undefined,
      clearedAt: clearedAt || undefined,
      reviewAt: src?.reviewAt,
      createdAt: src?.createdAt ?? Date.now(),
    };
    await db.injuries.put(rec);
    onClose();
  };

  return (
    <Sheet title={src ? 'Editar lesão' : 'Nova lesão'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <Field label="Condição" hint="A condição define os limites de estresse que o motor aplica — não proíbe exercícios por nome.">
          <select className="input" value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Gravidade">
          <div className="chips">
            {([1, 2, 3] as const).map((s) => (
              <button key={s} type="button" className={`chip btn-chip ${severity === s ? 'on' : ''}`} onClick={() => setSeverity(s)}>
                {s}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Situação">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as InjuryStatus)}>
            {Object.entries(INJURY_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Movimentos que doem" hint="Separe por vírgula. Ex.: flexão profunda de joelho, prensa overhead">
          <input className="input" value={painMoves} onChange={(e) => setPainMoves(e.target.value)} />
        </Field>
        <Field label="Observações clínicas">
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Orientações do fisioterapeuta/médico…" />
        </Field>
        <Field label="Liberada em" hint="Com data registrada, o motor volta a gerar planos para esta região.">
          <input className="input" type="date" value={clearedAt} onChange={(e) => setClearedAt(e.target.value)} />
        </Field>
        <button className="btn primary block">Salvar</button>
        {existing && (
          <button
            type="button"
            className="btn danger block"
            onClick={async () => {
              if (confirm('Excluir esta lesão?')) {
                await db.injuries.delete(existing.id);
                onClose();
              }
            }}
          >
            Excluir lesão
          </button>
        )}
      </form>
    </Sheet>
  );
}

function AssessmentSheet({
  clientId,
  existing,
  template,
  onClose,
}: {
  clientId: string;
  existing?: Assessment;
  template?: Assessment;
  onClose: () => void;
}) {
  const src = existing ?? template;
  const s = (v?: number) => (v == null ? '' : String(v));
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [level, setLevel] = useState<FitnessLevel | ''>(src?.fitnessLevel ?? '');
  const [months, setMonths] = useState(s(src?.monthsTraining));
  const [weight, setWeight] = useState(s(src?.weightKg));
  const [height, setHeight] = useState(s(src?.heightCm));
  const [fat, setFat] = useState(s(src?.bodyFatPct));
  const [waist, setWaist] = useState(s(src?.waistCm));
  const [hr, setHr] = useState(s(src?.restingHr));
  const [bp, setBp] = useState(src?.bloodPressure ?? '');
  const [injuries, setInjuries] = useState(src?.injuries ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // Bateria de benchmarks (plan seções 7-8): pré-carrega testes já salvos.
  const [tests, setTests] = useState<Record<string, TestDraft>>(() => toDrafts(src?.benchmarks));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const repTests = fromDrafts(tests);
    const a: Assessment = {
      ...(existing ?? {}), // preserva campos gerenciados fora deste form (ex.: benchmarks antigos)
      // Reteste/nova avaliação herda o PAR-Q+ vigente para não destravar o portão do motor.
      parq: existing?.parq ?? src?.parq,
      id: existing?.id ?? uid(),
      clientId,
      date,
      fitnessLevel: level || undefined,
      monthsTraining: num(months),
      weightKg: num(weight),
      heightCm: num(height),
      bodyFatPct: num(fat),
      waistCm: num(waist),
      restingHr: num(hr),
      bloodPressure: bp.trim() || undefined,
      injuries: injuries.trim() || undefined,
      notes: notes.trim() || undefined,
      benchmarks: repTests.length > 0 ? { repTests } : undefined,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    await db.assessments.put(a);
    onClose();
  };

  return (
    <Sheet title={existing ? 'Avaliação' : 'Nova avaliação'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid2">
          <Field label="Data">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Nível">
            <select className="input" value={level} onChange={(e) => setLevel(e.target.value as FitnessLevel)}>
              <option value="">—</option>
              {Object.entries(LEVEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Meses treinando">
            <input className="input" inputMode="numeric" placeholder="0" value={months} onChange={(e) => setMonths(e.target.value)} />
          </Field>
          <Field label="Peso (kg)">
            <input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
          <Field label="Altura (cm)">
            <input className="input" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
          </Field>
          <Field label="% Gordura">
            <input className="input" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />
          </Field>
          <Field label="Cintura (cm)">
            <input className="input" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} />
          </Field>
          <Field label="FC repouso (bpm)">
            <input className="input" inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} />
          </Field>
          <Field label="Pressão arterial">
            <input className="input" placeholder="12/8" value={bp} onChange={(e) => setBp(e.target.value)} />
          </Field>
        </div>
        <Field
          label="Bateria de testes (referência de carga)"
          hint="Testes de repetição com RIR (plan seções 7-8). Deixe em branco o que não foi testado — o motor estima o supino pela remada."
        >
          {BATTERY.map((t) => {
            const d = tests[t.engineId] ?? { reps: String(t.targetReps), loadKg: '', rir: '2' };
            const set = (patch: Partial<TestDraft>) =>
              setTests((prev) => ({ ...prev, [t.engineId]: { ...d, ...patch } }));
            const l = Number(d.loadKg.replace(',', '.'));
            const r = Number(d.reps.replace(',', '.'));
            const ri = Number(d.rir.replace(',', '.'));
            const e1 =
              l > 0 && r > 0 && ri >= 0 && [l, r, ri].every(Number.isFinite)
                ? Math.round(est1rm(l, r, ri))
                : null;
            return (
              <div key={t.engineId} className="card" style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{t.hint}</div>
                <div className="grid2">
                  <Field label="Reps">
                    <input className="input" inputMode="numeric" value={d.reps} onChange={(ev) => set({ reps: ev.target.value })} />
                  </Field>
                  <Field label="Carga (kg)">
                    <input className="input" inputMode="decimal" placeholder="—" value={d.loadKg} onChange={(ev) => set({ loadKg: ev.target.value })} />
                  </Field>
                  <Field label="RIR">
                    <input className="input" inputMode="numeric" value={d.rir} onChange={(ev) => set({ rir: ev.target.value })} />
                  </Field>
                  <Field label="e1RM estimado">
                    <div className="input" style={{ opacity: 0.7 }}>{e1 == null ? '—' : `~${e1} kg`}</div>
                  </Field>
                </div>
              </div>
            );
          })}
        </Field>
        <Field label="Lesões / restrições">
          <textarea className="input" rows={2} value={injuries} onChange={(e) => setInjuries(e.target.value)} placeholder="Ex.: condromalácia joelho D — evitar agachamento profundo" />
        </Field>
        <Field label="Observações">
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Postura, mobilidade, sono, dores…" />
        </Field>
        <button className="btn primary block">Salvar avaliação</button>
        {existing && (
          <button
            type="button"
            className="btn danger block"
            onClick={async () => {
              if (confirm('Excluir esta avaliação?')) {
                await db.assessments.delete(existing.id);
                onClose();
              }
            }}
          >
            Excluir avaliação
          </button>
        )}
      </form>
    </Sheet>
  );
}

function Stat({ label, value, unit, extra }: { label: string; value?: number | string; unit?: string; extra?: string }) {
  if (value == null || value === '') return null;
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <small> {unit}</small>}
      </span>
      {extra && <span className="stat-extra">{extra}</span>}
    </div>
  );
}
