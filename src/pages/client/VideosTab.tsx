import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { VideoPlayerSheet, VideoThumb, shareVideos } from '../../components/VideoCard';
import { VideoRecorder } from '../../components/VideoRecorder';
import { Empty } from '../../components/ui';
import { db, uid, type Client, type Video } from '../../lib/db';

export function VideosTab({ client }: { client: Client }) {
  const videos = useLiveQuery(() => db.videos.where('clientId').equals(client.id).reverse().sortBy('createdAt'), [client.id]);
  const [open, setOpen] = useState<Video | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);

  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  };
  const totalMb = (videos ?? []).reduce((a, v) => a + v.blob.size, 0) / 1e6;

  return (
    <section className="stack">
      <div className="row gap">
        <button className="btn grow" onClick={() => setRecording(true)}>
          ● Gravar vídeo
        </button>
        {!!videos?.length && (
          <button
            className={`btn grow ${selecting ? 'primary' : ''}`}
            onClick={() => {
              setSelecting(!selecting);
              setSel(new Set());
            }}
          >
            {selecting ? 'Cancelar seleção' : 'Selecionar'}
          </button>
        )}
      </div>

      {videos?.length === 0 ? (
        <Empty icon="🎥" title="Nenhum vídeo">
          <p className="muted">Grave durante a sessão para mostrar a execução ao cliente depois.</p>
        </Empty>
      ) : (
        <div className="vgrid">
          {videos?.map((v) => (
            <VideoThumb key={v.id} video={v} selected={selecting ? sel.has(v.id) : undefined} onClick={() => (selecting ? toggle(v.id) : setOpen(v))} />
          ))}
        </div>
      )}
      {!!videos?.length && <p className="muted small center">{videos.length} vídeos · {totalMb.toFixed(totalMb < 10 ? 1 : 0)} MB neste aparelho</p>}

      {selecting && sel.size > 0 && (
        <div className="floating-bar">
          <button
            className="btn primary block big"
            onClick={async () => {
              await shareVideos(videos!.filter((v) => sel.has(v.id)), client.name);
              setSelecting(false);
              setSel(new Set());
            }}
          >
            Compartilhar {sel.size} vídeo{sel.size > 1 ? 's' : ''} com {client.name.split(' ')[0]}
          </button>
        </div>
      )}

      {open && <VideoPlayerSheet video={open} clientName={client.name} onClose={() => setOpen(null)} />}
      {recording && (
        <VideoRecorder
          onClose={() => setRecording(false)}
          onSave={async (blob, mimeType, durationSec, note) => {
            await db.videos.add({ id: uid(), clientId: client.id, blob, mimeType, durationSec, note: note || undefined, createdAt: Date.now() });
          }}
        />
      )}
    </section>
  );
}
