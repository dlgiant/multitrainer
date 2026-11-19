import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export function TopBar({ title, back, right }: { title: ReactNode; back?: string | true; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="topbar">
      {back ? (
        <button className="icon-btn" aria-label="Voltar" onClick={() => (back === true ? nav(-1) : nav(back))}>
          ‹
        </button>
      ) : (
        <span className="brand">MT</span>
      )}
      <h1>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  suffix,
  label,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  suffix?: string;
  label?: string;
}) {
  const v = value ?? 0;
  const round = (x: number) => Math.round(x * 100) / 100;
  return (
    <div className="stepper">
      {label && <span className="stepper-label">{label}</span>}
      <div className="stepper-row">
        <button type="button" onClick={() => onChange(Math.max(min, round(v - step)))} aria-label={`Diminuir ${label ?? ''}`}>
          −
        </button>
        <input
          inputMode="decimal"
          value={value ?? ''}
          placeholder="—"
          onChange={(e) => {
            const t = e.target.value.replace(',', '.');
            if (t === '') return onChange(undefined);
            const n = Number(t);
            if (Number.isFinite(n)) onChange(n);
          }}
        />
        {suffix && <span className="stepper-suffix">{suffix}</span>}
        <button type="button" onClick={() => onChange(round(v + step))} aria-label={`Aumentar ${label ?? ''}`}>
          +
        </button>
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <nav className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = window.location.pathname;
  const item = (to: string, icon: string, label: string) => (
    <Link to={to} className={(to === '/' ? path === '/' || path.startsWith('/clientes') : path.startsWith(to)) ? 'on' : ''}>
      <span>{icon}</span>
      {label}
    </Link>
  );
  return (
    <nav className="bottomnav">
      {item('/', '👥', 'Clientes')}
      {item('/exercicios', '📚', 'Exercícios')}
      {item('/ajustes', '⚙️', 'Ajustes')}
    </nav>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
