import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Sheet, Tabs, TopBar } from '../components/ui';
import { db } from '../lib/db';
import { startSession } from '../lib/session';
import { unlockAudio } from '../lib/utils';
import { EquipmentTab } from './client/EquipmentTab';
import { HistoryTab } from './client/HistoryTab';
import { ProfileTab } from './client/ProfileTab';
import { ProgramTab } from './client/ProgramTab';
import { RoutinesTab } from './client/RoutinesTab';
import { VideosTab } from './client/VideosTab';
import { WorkoutsTab } from './client/WorkoutsTab';

type Tab = 'perfil' | 'equip' | 'programa' | 'treinos' | 'rotinas' | 'historico' | 'videos';

export function ClientPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'perfil';
  const [picking, setPicking] = useState(false);
  const client = useLiveQuery(() => db.clients.get(id), [id]);
  const workouts = useLiveQuery(() => db.workouts.where('clientId').equals(id).toArray(), [id]);
  const activeSession = useLiveQuery(
    () => db.sessions.where('clientId').equals(id).filter((s) => !s.endedAt).first(),
    [id],
  );

  if (client === undefined) return <div className="page" />;
  if (client === null) return <div className="page"><TopBar title="Cliente não encontrado" back="/" /></div>;

  const begin = async (workoutId?: string) => {
    unlockAudio();
    const w = workoutId ? workouts?.find((x) => x.id === workoutId) : undefined;
    const sid = await startSession(id, w);
    nav(`/sessao/${sid}`);
  };

  return (
    <div className="page">
      <TopBar title={client.name} back="/" />
      <main className="content">
        {activeSession ? (
          <button className="btn live block big" onClick={() => nav(`/sessao/${activeSession.id}`)}>
            <span className="pulse" /> Retomar sessão em andamento
          </button>
        ) : (
          <button className="btn primary block big" onClick={() => (workouts?.length ? setPicking(true) : begin())}>
            ▶ Iniciar treino
          </button>
        )}

        <Tabs
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          tabs={[
            { id: 'perfil', label: 'Perfil' },
            { id: 'equip', label: 'Equipamentos' },
            { id: 'programa', label: 'Programa' },
            { id: 'treinos', label: 'Treinos' },
            { id: 'rotinas', label: 'Rotinas' },
            { id: 'historico', label: 'Histórico' },
            { id: 'videos', label: 'Vídeos' },
          ]}
        />

        {tab === 'perfil' && <ProfileTab client={client} />}
        {tab === 'equip' && <EquipmentTab clientId={id} />}
        {tab === 'programa' && <ProgramTab clientId={id} clientName={client.name} />}
        {tab === 'treinos' && <WorkoutsTab clientId={id} onStart={begin} />}
        {tab === 'rotinas' && <RoutinesTab client={client} />}
        {tab === 'historico' && <HistoryTab clientId={id} />}
        {tab === 'videos' && <VideosTab client={client} />}
      </main>

      {picking && (
        <Sheet title="Qual treino?" onClose={() => setPicking(false)}>
          <ul className="list">
            {workouts?.map((w) => (
              <li key={w.id}>
                <button className="list-item" onClick={() => begin(w.id)}>
                  <span className="grow">
                    <b>{w.name}</b>
                    <small className="muted">{w.items.length} exercícios</small>
                  </span>
                  <span className="chev">▶</span>
                </button>
              </li>
            ))}
            <li>
              <button className="list-item" onClick={() => begin()}>
                <span className="grow">
                  <b>Treino livre</b>
                  <small className="muted">Adicionar exercícios durante a sessão</small>
                </span>
                <span className="chev">▶</span>
              </button>
            </li>
          </ul>
        </Sheet>
      )}
    </div>
  );
}
