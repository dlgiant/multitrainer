import { useEffect, useState } from 'react';

export function fmtClock(totalSec: number) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function fmtDate(ts: number | string) {
  const d = typeof ts === 'string' ? new Date(ts + 'T12:00:00') : new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function ageFrom(birthDate?: string) {
  if (!birthDate) return undefined;
  const b = new Date(birthDate + 'T12:00:00');
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

export const fmtKg = (kg?: number) => (kg == null ? '' : `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`);

export const num = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** Lista "2, 4, 6-10" → [2,4,6,7,8,9,10] (intervalos de 1 em 1, ou passo indicado: "6-20/2"). */
export function parseWeights(text: string): number[] {
  const out = new Set<number>();
  for (const raw of text.split(/[;,\s]+/)) {
    const part = raw.trim().replace(/kg$/i, '');
    if (!part) continue;
    const m = part.match(/^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)(?:\/(\d+(?:[.,]\d+)?))?$/);
    if (m) {
      const a = Number(m[1].replace(',', '.'));
      const b = Number(m[2].replace(',', '.'));
      const step = m[3] ? Number(m[3].replace(',', '.')) : 1;
      if (step > 0 && b >= a && (b - a) / step <= 200) {
        for (let x = a; x <= b + 1e-9; x += step) out.add(Math.round(x * 100) / 100);
      }
    } else {
      const n = Number(part.replace(',', '.'));
      if (Number.isFinite(n) && n >= 0) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Re-renderiza a cada `ms` enquanto `active`. Retorna Date.now(). */
export function useNow(active = true, ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

/** Mantém a tela ligada durante a sessão (quando suportado). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        /* ignorado: bateria fraca, aba em segundo plano, etc. */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

let audioCtx: AudioContext | null = null;

/** Precisa ser chamado num gesto do usuário (iOS) para liberar o áudio. */
export function unlockAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    /* sem áudio */
  }
}

export function beep(freq = 880, durMs = 150, volume = 0.25) {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durMs / 1000 + 0.02);
  } catch {
    /* sem áudio */
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sem vibração */
  }
}

export async function shareFiles(files: File[], text?: string) {
  const data: ShareData = { files, text };
  if (navigator.canShare?.(data)) {
    await navigator.share(data);
    return true;
  }
  // Fallback: baixar
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return false;
}

export async function shareText(text: string, title?: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text, title });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  await navigator.clipboard?.writeText(text);
  alert('Texto copiado para a área de transferência.');
}

export function videoExt(mime: string) {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  return 'webm';
}

export function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
