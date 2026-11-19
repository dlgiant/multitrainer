import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomNav, Empty, Field, Sheet, TopBar } from '../components/ui';
import { db, uid } from '../lib/db';
import { fmtDate } from '../lib/utils';

export function ClientsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);

  const active = sessions?.filter((s) => !s.endedAt) ?? [];
  const lastByClient = new Map<string, number>();
  for (const s of sessions ?? []) lastByClient.set(s.clientId, Math.max(lastByClient.get(s.clientId) ?? 0, s.startedAt));

  const list = (clients ?? []).filter(
    (c) => !!c.archived === showArchived && c.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="page">
      <TopBar
        title="Clientes"
        right={
          <button className="btn primary sm" onClick={() => setAdding(true)}>
            + Novo
          </button>
        }
      />
      <main className="content">
        {active.map((s) => {
          const c = clients?.find((x) => x.id === s.clientId);
          return (
            <Link key={s.id} to={`/sessao/${s.id}`} className="banner live">
              <span className="pulse" /> Sessão em andamento — <b>{c?.name ?? '…'}</b>
              <span className="banner-cta">Retomar ›</span>
            </Link>
          );
        })}

        {(clients?.length ?? 0) > 0 && <input className="input search" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />}

        {clients && clients.length === 0 ? (
          <Empty icon="🏋️" title="Nenhum cliente ainda">
            <p className="muted">Cadastre o primeiro cliente para montar o perfil, os equipamentos da casa e os treinos.</p>
            <button className="btn primary" onClick={() => setAdding(true)}>
              Cadastrar cliente
            </button>
          </Empty>
        ) : (
          <ul className="list">
            {list.map((c) => {
              const last = lastByClient.get(c.id);
              return (
                <li key={c.id}>
                  <Link to={`/clientes/${c.id}`} className="list-item">
                    <span className="avatar">{c.name.slice(0, 1).toUpperCase()}</span>
                    <span className="grow">
                      <b>{c.name}</b>
                      <small className="muted">{last ? `Último treino: ${fmtDate(last)}` : 'Sem treinos registrados'}</small>
                    </span>
                    <span className="chev">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {clients?.some((c) => c.archived) && (
          <button className="btn ghost sm center-block" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Ver clientes ativos' : 'Ver arquivados'}
          </button>
        )}
      </main>
      <BottomNav />

      {adding && (
        <NewClientSheet
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            nav(`/clientes/${id}`);
          }}
        />
      )}
    </div>
  );
}

function NewClientSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [goals, setGoals] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = uid();
    await db.clients.add({ id, name: name.trim(), phone, address, goals, createdAt: Date.now() });
    onCreated(id);
  };
  return (
    <Sheet title="Novo cliente" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Nome *">
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Telefone / WhatsApp">
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Endereço do treino">
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Objetivos">
          <textarea className="input" rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="Ex.: perder 5 kg, fortalecer lombar" />
        </Field>
        <button className="btn primary block" disabled={!name.trim()}>
          Criar cliente
        </button>
      </form>
    </Sheet>
  );
}
