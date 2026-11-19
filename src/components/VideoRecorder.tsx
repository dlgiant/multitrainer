import { useEffect, useRef, useState } from 'react';
import { fmtClock, useNow } from '../lib/utils';

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

interface Props {
  title?: string;
  onSave: (blob: Blob, mime: string, durationSec: number, note: string) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Gravador em tela cheia. Usa a câmera traseira por padrão (o personal filma o cliente).
 * Se a câmera não estiver disponível no navegador, cai para o seletor nativo de vídeo.
 */
export function VideoRecorder({ title, onSave, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [recStart, setRecStart] = useState<number | null>(null);
  const [result, setResult] = useState<{ blob: Blob; url: string; mime: string; dur: number } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const now = useNow(recStart != null, 250);

  useEffect(() => {
    if (result) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setError(null);
        setReady(true);
      } catch (e) {
        setError((e as Error).message || 'Câmera indisponível');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing, result]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const start = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 }) : new MediaRecorder(stream);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    const startedAt = Date.now();
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'video/webm';
      const blob = new Blob(chunks.current, { type });
      setResult({ blob, url: URL.createObjectURL(blob), mime: type, dur: (Date.now() - startedAt) / 1000 });
      setRecStart(null);
    };
    rec.start(1000);
    recRef.current = rec;
    setRecStart(startedAt);
  };

  const stop = () => recRef.current?.state === 'recording' && recRef.current.stop();

  const save = async () => {
    if (!result) return;
    setSaving(true);
    await onSave(result.blob, result.mime, result.dur, note.trim());
    onClose();
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setResult({ blob: f, url: URL.createObjectURL(f), mime: f.type || 'video/mp4', dur: 0 });
  };

  return (
    <div className="recorder">
      <div className="recorder-top">
        <button className="icon-btn light" onClick={() => (recStart ? stop() : onClose())} aria-label="Fechar">
          ✕
        </button>
        <span className="recorder-title">{title ?? 'Gravar vídeo'}</span>
        {!result && !recStart && !error ? (
          <button className="icon-btn light" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Trocar câmera">
            ⟲
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
      </div>

      {result ? (
        <>
          <video className="recorder-view" src={result.url} controls playsInline autoPlay />
          <div className="recorder-bottom">
            <input className="input" placeholder="Observação (ex.: corrigir postura dos joelhos)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row gap">
              <button className="btn ghost light grow" onClick={() => setResult(null)} disabled={saving}>
                Regravar
              </button>
              <button className="btn primary grow" onClick={save} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar vídeo'}
              </button>
            </div>
          </div>
        </>
      ) : error ? (
        <div className="recorder-fallback">
          <p>Não foi possível abrir a câmera aqui ({error}).</p>
          <label className="btn primary">
            Abrir câmera do celular
            <input type="file" accept="video/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
      ) : (
        <>
          <video ref={videoRef} className={`recorder-view ${facing === 'user' ? 'mirror' : ''}`} muted playsInline autoPlay />
          <div className="recorder-bottom center">
            {recStart != null && <div className="rec-time">● {fmtClock((now - recStart) / 1000)}</div>}
            <button className={`rec-btn ${recStart != null ? 'on' : ''}`} onClick={recStart != null ? stop : start} disabled={!ready} aria-label={recStart != null ? 'Parar' : 'Gravar'}>
              <span />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
