import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { VideoPlayerSheet, VideoThumb, shareVideos } from '../components/VideoCard';
import { TopBar } from '../components/ui';
import { db, type Video } from '../lib/db';
import { proposedChanges, changeShortLabel, changeReasonLabel, commitDiff } from '../lib/progressionDiff';
import { sessionSummaryText, sessionVolume } from '../lib/session';
import type { Change } from '../engine/types';
import { fmtDateTime, fmtKg, shareText } from '../lib/utils';

export function SessionDetail() {
  const { sid = '' } = useParams();
  const nav = useNavigate();
  const session = useLiveQuery(() => db.sessions.get(sid), [sid]);
  const client = useLiveQuery(async () => (session ? db.clients.get(session.clientId) : undefined), [session?.clientId]);
  const videos = useLiveQuery(() => db.videos.where('sessionId').equals(sid).sortBy('createdAt'), [sid]);
  const [open, setOpen] = useState<Video | null>(null);

  const workout = useLiveQuery(
    async () => (session?.workoutId ? db.workouts.get(session.workoutId) : undefined),
    [session?.workoutId],
  );
  const history = useLiveQuery(
    async () =>
      session ? db.sessions.where('clientId').equals(session.clientId).filter((s) => !!s.endedAt).toArray() : [],
    [session?.clientId],
  );

  const showDiff = !!session?.endedAt && !!workout && !session.diffAppliedAt;
  const [diff, setDiff] = useState<Change[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const changeTo = (c: Change) => (c.kind === 'hold' ? '' : (c.to ?? ''));
  const diffKey = (c: Change) => `${c.exerciseId}:${c.kind}:${changeTo(c)}`;

  useEffect(() => {
    let alive = true;
    if (!showDiff || !workout || !history) return;
    proposedChanges(workout, history).then((changes) => {
      if (!alive) return;
      setDiff(changes);
      setSelected(new Set(changes.map(diffKey)));
    });
    return () => {
      alive = false;
    };
  }, [showDiff, workout?.id, workout?.updatedAt, history?.length]);

  const applyDiff = async () => {
    if (!workout || !diff || !session) return;
    setApplying(true);
    try {
      const accepted = diff.filter((c) => selected.has(diffKey(c)));
      const rejected = diff.filter((c) => !selected.has(diffKey(c)));
      await commitDiff(workout, accepted, rejected);
      await db.sessions.update(session.id, { diffAppliedAt: Date.now() });
    } finally {
      setApplying(false);
    }
  };

  if (session === undefined) return <div className="page" />;
  if (session === null) return <div className="page"><TopBar title="Sessão não encontrada" back="/" /></div>;

  const { sets, volume } = sessionVolume(session);
  const min = Math.round(((session.endedAt ?? Date.now()) - session.startedAt) / 60000);
  const back = `/clientes/${session.clientId}?tab=historico`;

  return (
    <div className="page">
      <TopBar title={session.workoutName} back={back} />
      <main className="content stack">
        <p className="muted">
          {client?.name} · {fmtDateTime(session.startedAt)}
        </p>
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Duração</span>
            <span className="stat-value">
              {min}
              <small> min</small>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Séries</span>
            <span className="stat-value">{sets}</span>
          </div>
          {volume > 0 && (
            <div className="stat">
              <span className="stat-label">Volume</span>
              <span className="stat-value">
                {Math.round(volume)}
                <small> kg</small>
              </span>
            </div>
          )}
          {session.rpe && (
            <div className="stat">
              <span className="stat-label">PSE</span>
              <span className="stat-value">{session.rpe}/10</span>
            </div>
          )}
        </div>

        {session.notes && <div className="card pre">{session.notes}</div>}

        {showDiff && (
          <div className="card">
            <div className="card-head">
              <h3>🤖 Proposta para a próxima sessão</h3>
              <span className="chip muted">motor {diff ? `${selected.size}/${diff.length}` : '…'}</span>
            </div>
            {!diff && <p className="muted">Analisando o histórico…</p>}
            {diff?.length === 0 && <p className="muted">Sem mudanças propostas: manter o treino como está.</p>}
            {!!diff?.length && (
              <>
                <ul className="list">
                  {diff.map((c) => {
                    const key = diffKey(c);
                    const on = selected.has(key);
                    return (
                      <li key={key}>
                        <label className="list-item">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (on) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                          />
                          <span className="grow">
                            <b>{changeShortLabel(c)}</b>
                            <small className="muted">{changeReasonLabel(c)}</small>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <button
                  className="btn primary block"
                  disabled={applying || selected.size === 0}
                  onClick={applyDiff}
                >
                  {applying
                    ? 'Aplicando…'
                    : `Aplicar selecionadas (${selected.size})${selected.size < diff.length ? ` · recusar ${diff.length - selected.size}` : ''}`}
                </button>
              </>
            )}
          </div>
        )}

        {session.entries.map((e) => (
          <div key={e.key} className="card">
            <h3>{e.exerciseName}</h3>
            {e.notes && <p className="muted small pre">{e.notes}</p>}
            <table className="tbl">
              <tbody>
                {e.sets.map((s, i) => (
                  <tr key={i}>
                    <td className="muted">{i + 1}</td>
                    <td>{e.mode === 'tempo' ? `${s.durationSec ?? '—'} s` : `${s.reps ?? '—'} reps`}</td>
                    <td>{fmtKg(s.weightKg) || 'peso corporal'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {!!videos?.length && (
          <>
            <div className="card-head">
              <h3>Vídeos da sessão</h3>
              <button className="btn sm primary" onClick={() => shareVideos(videos, client?.name ?? '')}>
                Compartilhar todos
              </button>
            </div>
            <div className="vgrid">
              {videos.map((v) => (
                <VideoThumb key={v.id} video={v} onClick={() => setOpen(v)} />
              ))}
            </div>
          </>
        )}

        <button className="btn primary block" onClick={() => shareText(sessionSummaryText(session, client?.name ?? ''), 'Resumo do treino')}>
          Enviar resumo ao cliente
        </button>
        <button
          className="btn danger block"
          onClick={async () => {
            if (!confirm('Excluir esta sessão do histórico? Os vídeos são mantidos.')) return;
            await db.sessions.delete(sid);
            nav(back, { replace: true });
          }}
        >
          Excluir sessão
        </button>
      </main>
      {open && <VideoPlayerSheet video={open} clientName={client?.name ?? ''} onClose={() => setOpen(null)} />}
    </div>
  );
}
