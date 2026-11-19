import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Empty, Field, Sheet } from '../../components/ui';
import { db, uid, type Equipment } from '../../lib/db';
import { parseWeights } from '../../lib/utils';

const PRESETS = ['Halteres', 'Kettlebell', 'Elásticos', 'Barra + anilhas', 'Banco', 'Caneleiras', 'Bola suíça', 'TRX / suspensão', 'Barra fixa', 'Colchonete', 'Step', 'Corda'];

export function EquipmentTab({ clientId }: { clientId: string }) {
  const items = useLiveQuery(() => db.equipment.where('clientId').equals(clientId).sortBy('createdAt'), [clientId]);
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);

  return (
    <section className="stack">
      <p className="muted small">
        O que existe na casa do cliente. As cargas cadastradas aqui são usadas para sugerir a próxima carga na progressão.
      </p>
      {items?.length === 0 ? (
        <Empty icon="🏠" title="Nenhum equipamento cadastrado">
          <p className="muted">Sem equipamento? Tudo bem — treinos com peso corporal funcionam normalmente.</p>
        </Empty>
      ) : (
        <ul className="list">
          {items?.map((eq) => (
            <li key={eq.id}>
              <button className="list-item" onClick={() => setEditing(eq)}>
                <span className="grow">
                  <b>{eq.name}</b>
                  {eq.weights.length > 0 && (
                    <span className="chips">
                      {eq.weights.map((w) => (
                        <span key={w} className="chip">
                          {w} kg
                        </span>
                      ))}
                    </span>
                  )}
                  {eq.notes && <small className="muted">{eq.notes}</small>}
                </span>
                <span className="chev">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn primary block" onClick={() => setEditing('new')}>
        + Adicionar equipamento
      </button>
      {editing && <EquipmentSheet clientId={clientId} existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function EquipmentSheet({ clientId, existing, onClose }: { clientId: string; existing?: Equipment; onClose: () => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [weights, setWeights] = useState(existing?.weights.join(', ') ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const parsed = parseWeights(weights);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await db.equipment.put({
      id: existing?.id ?? uid(),
      clientId,
      name: name.trim(),
      weights: parsed,
      notes: notes.trim() || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
    });
    onClose();
  };

  return (
    <Sheet title={existing ? 'Editar equipamento' : 'Novo equipamento'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        {!existing && (
          <div className="chips">
            {PRESETS.map((p) => (
              <button type="button" key={p} className={`chip btn-chip ${name === p ? 'on' : ''}`} onClick={() => setName(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Halteres ajustáveis" />
        </Field>
        <Field label="Cargas disponíveis (kg)" hint="Separe por vírgula. Intervalos: 2-20/2 = 2, 4, 6 … 20">
          <input className="input" value={weights} onChange={(e) => setWeights(e.target.value)} placeholder="Ex.: 2, 4, 6, 8, 10 ou 2-20/2" />
        </Field>
        {parsed.length > 0 && (
          <div className="chips">
            {parsed.map((w) => (
              <span key={w} className="chip">
                {w} kg
              </span>
            ))}
          </div>
        )}
        <Field label="Observações">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: elástico verde = leve, preto = forte" />
        </Field>
        <button className="btn primary block" disabled={!name.trim()}>
          Salvar
        </button>
        {existing && (
          <button
            type="button"
            className="btn danger block"
            onClick={async () => {
              if (confirm(`Remover ${existing.name}?`)) {
                await db.equipment.delete(existing.id);
                onClose();
              }
            }}
          >
            Remover
          </button>
        )}
      </form>
    </Sheet>
  );
}
