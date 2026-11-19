import { useEffect, useState } from 'react';
import { BottomNav, TopBar } from '../components/ui';
import { db } from '../lib/db';
import { seedDemoClients } from '../lib/demoSeed';
import { shareFiles, todayISO } from '../lib/utils';

const TABLES = ['clients', 'assessments', 'equipment', 'exercises', 'workouts', 'sessions'] as const;

export function SettingsPage() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');

  const refresh = async () => {
    const est = await navigator.storage?.estimate?.();
    if (est) setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0 });
    setPersisted((await navigator.storage?.persisted?.()) ?? null);
  };
  useEffect(() => {
    refresh();
  }, []);

  const exportData = async () => {
    const data: Record<string, unknown[]> = {};
    for (const t of TABLES) data[t] = await db.table(t).toArray();
    const blob = new Blob([JSON.stringify({ app: 'multitrainer', version: 1, exportedAt: Date.now(), data })], { type: 'application/json' });
    const file = new File([blob], `multitrainer-backup-${todayISO()}.json`, { type: 'application/json' });
    try {
      await shareFiles([file]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('Erro ao exportar: ' + (e as Error).message);
    }
  };

  const importData = async (f?: File) => {
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (json.app !== 'multitrainer' || !json.data) throw new Error('Arquivo não é um backup do MultiTrainer');
      if (!confirm('Importar backup? Registros com o mesmo ID serão substituídos; os demais são mantidos.')) return;
      await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
        for (const t of TABLES) if (Array.isArray(json.data[t])) await db.table(t).bulkPut(json.data[t]);
      });
      setMsg('Backup importado com sucesso.');
    } catch (e) {
      setMsg('Erro ao importar: ' + (e as Error).message);
    }
  };

  return (
    <div className="page">
      <TopBar title="Ajustes" />
      <main className="content stack">
        <div className="card">
          <h3>Armazenamento</h3>
          <p className="muted small">
            Todos os dados e vídeos ficam guardados <b>apenas neste aparelho</b>, funcionando mesmo sem internet na casa do cliente.
          </p>
          {usage && (
            <p>
              Usando <b>{(usage.used / 1e6).toFixed(0)} MB</b> de ~{(usage.quota / 1e9).toFixed(1)} GB disponíveis.
            </p>
          )}
          {persisted === false && (
            <button
              className="btn block"
              onClick={async () => {
                const ok = await navigator.storage?.persist?.();
                setMsg(ok ? 'Armazenamento protegido.' : 'O navegador não permitiu. Instale o app na tela inicial e tente de novo.');
                refresh();
              }}
            >
              Proteger dados contra limpeza automática
            </button>
          )}
          {persisted && <p className="ok small">✓ Armazenamento persistente ativado</p>}
        </div>

        <div className="card">
          <h3>Backup</h3>
          <p className="muted small">Exporta clientes, avaliações, equipamentos, treinos e histórico (sem os vídeos). Guarde no Drive/WhatsApp.</p>
          <button className="btn primary block" onClick={exportData}>
            Exportar backup
          </button>
          <label className="btn block">
            Importar backup
            <input type="file" accept="application/json,.json" hidden onChange={(e) => importData(e.target.files?.[0])} />
          </label>
          {msg && <p className="small">{msg}</p>}
        </div>

        <div className="card">
          <h3>Dados de demonstração</h3>
          <p className="muted small">
            Adiciona 5 clientes completos para testar o motor: objetivo estruturado, avaliação, equipamento com cargas, lesões estruturadas e treinos.
            Inclui um caso com porta de segurança bloqueada (Diego, ombro agudo). Rodar de novo apenas atualiza — não duplica.
          </p>
          <button
            className="btn block"
            onClick={async () => {
              if (!confirm('Adicionar/atualizar os 5 clientes de demonstração?')) return;
              try {
                await seedDemoClients();
                setMsg('Clientes de demonstração criados: Ana, Bruno, Carla, Diego e Marina.');
              } catch (e) {
                setMsg('Erro ao semear: ' + (e as Error).message);
              }
            }}
          >
            Criar clientes de demonstração
          </button>
        </div>

        <div className="card">
          <h3>Dicas de uso</h3>
          <ul className="tips">
            <li>Adicione à tela inicial (Compartilhar → “Adicionar à Tela de Início”) para abrir como app e funcionar offline.</li>
            <li>Durante a sessão a tela fica ligada e o timer de descanso avisa com bipes e vibração — o cliente não precisa olhar o celular.</li>
            <li>Cadastre as cargas dos equipamentos de cada casa: a progressão sugere exatamente o próximo peso disponível.</li>
          </ul>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
