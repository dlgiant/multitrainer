import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Empty } from '../../components/ui';
import { db } from '../../lib/db';
import { sessionVolume } from '../../lib/session';
import { fmtDate } from '../../lib/utils';

export function HistoryTab({ clientId }: { clientId: string }) {
  const sessions = useLiveQuery(
    async () => (await db.sessions.where('clientId').equals(clientId).toArray()).filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt),
    [clientId],
  );
  const videoCounts = useLiveQuery(async () => {
    const m = new Map<string, number>();
    await db.videos.where('clientId').equals(clientId).each((v) => v.sessionId && m.set(v.sessionId, (m.get(v.sessionId) ?? 0) + 1));
    return m;
  }, [clientId]);

  if (sessions?.length === 0)
    return <Empty icon="🗓️" title="Nenhuma sessão concluída">Inicie um treino para começar o histórico.</Empty>;

  // Frequência das últimas 4 semanas
  const fourWeeks = Date.now() - 28 * 864e5;
  const recent = sessions?.filter((s) => s.startedAt > fourWeeks).length ?? 0;

  return (
    <section className="stack">
      <div className="stats">
        <div className="stat">
          <span className="stat-label">Sessões</span>
          <span className="stat-value">{sessions?.length ?? 0}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Últimas 4 sem.</span>
          <span className="stat-value">{recent}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Média/sem.</span>
          <span className="stat-value">{(recent / 4).toFixed(1)}</span>
        </div>
      </div>
      <ul className="list">
        {sessions?.map((s) => {
          const { sets, volume } = sessionVolume(s);
          const min = Math.round(((s.endedAt ?? s.startedAt) - s.startedAt) / 60000);
          const vids = videoCounts?.get(s.id);
          return (
            <li key={s.id}>
              <Link to={`/sessoes/${s.id}`} className="list-item">
                <span className="grow">
                  <b>{s.workoutName}</b>
                  <small className="muted">
                    {fmtDate(s.startedAt)} · {min} min · {sets} séries{volume ? ` · ${Math.round(volume)} kg vol.` : ''}
                    {vids ? ` · 🎥 ${vids}` : ''}
                    {s.rpe ? ` · PSE ${s.rpe}` : ''}
                  </small>
                </span>
                <span className="chev">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
