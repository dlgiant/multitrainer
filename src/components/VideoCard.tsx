import { useEffect, useState } from 'react';
import { db, type Video } from '../lib/db';
import { fmtClock, fmtDateTime, shareFiles, slug, videoExt } from '../lib/utils';
import { Sheet } from './ui';

export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function videoFile(v: Video, clientName: string) {
  const d = new Date(v.createdAt);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const name = `${slug(clientName)}-${slug(v.exerciseName ?? 'treino')}-${stamp}.${videoExt(v.mimeType)}`;
  return new File([v.blob], name, { type: v.mimeType.split(';')[0] });
}

export async function shareVideos(videos: Video[], clientName: string) {
  const files = videos.map((v) => videoFile(v, clientName));
  const notes = videos
    .filter((v) => v.note)
    .map((v) => `• ${v.exerciseName ?? 'Vídeo'}: ${v.note}`)
    .join('\n');
  try {
    await shareFiles(files, notes || undefined);
    await db.videos.bulkUpdate(videos.map((v) => ({ key: v.id, changes: { sharedAt: Date.now() } })));
  } catch (e) {
    if ((e as Error).name !== 'AbortError') alert('Não foi possível compartilhar: ' + (e as Error).message);
  }
}

export function VideoThumb({
  video,
  selected,
  onClick,
}: {
  video: Video;
  selected?: boolean;
  onClick: () => void;
}) {
  const url = useObjectUrl(video.blob);
  return (
    <button className={`vthumb ${selected ? 'selected' : ''}`} onClick={onClick}>
      {url && <video src={`${url}#t=0.1`} preload="metadata" muted playsInline />}
      <span className="vthumb-info">
        <b>{video.exerciseName ?? 'Vídeo'}</b>
        <small>
          {fmtDateTime(video.createdAt)}
          {video.durationSec ? ` · ${fmtClock(video.durationSec)}` : ''}
        </small>
      </span>
      {video.sharedAt && <span className="vthumb-badge">✓ enviado</span>}
      {selected != null && <span className="vthumb-check">{selected ? '✓' : ''}</span>}
    </button>
  );
}

export function VideoPlayerSheet({ video, clientName, onClose }: { video: Video; clientName: string; onClose: () => void }) {
  const url = useObjectUrl(video.blob);
  const [note, setNote] = useState(video.note ?? '');
  return (
    <Sheet title={video.exerciseName ?? 'Vídeo'} onClose={onClose}>
      {url && <video className="player" src={url} controls playsInline autoPlay />}
      <p className="muted small">{fmtDateTime(video.createdAt)}</p>
      <input
        className="input"
        placeholder="Observação para o cliente"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => db.videos.update(video.id, { note: note.trim() || undefined })}
      />
      <div className="row gap">
        <button className="btn primary grow" onClick={() => shareVideos([{ ...video, note: note.trim() || undefined }], clientName)}>
          Compartilhar
        </button>
        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm('Excluir este vídeo?')) return;
            await db.videos.delete(video.id);
            onClose();
          }}
        >
          Excluir
        </button>
      </div>
    </Sheet>
  );
}
