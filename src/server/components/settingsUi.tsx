import React, { useEffect } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { cn } from '../../shared/ui/utils';

// Building blocks for server pages (Pengaturan, Tarif, Transaksi, Laporan), per DESIGN.md sections 2 to 4.

export const api = () => (window as any).electronAPI;
export const denied = (res: any) => res && res.success === false;

export const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
export const INPUT = 'h-9 w-full px-3 rounded-sm bg-surface-3 border border-hairline text-[13px] text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-primary disabled:opacity-60';
export const BTN_PRIMARY = `inline-flex items-center justify-center gap-2 h-9 px-4 rounded-sm bg-primary text-on-primary text-[13px] font-semibold hover:bg-primary-hover active:translate-y-px disabled:opacity-50 disabled:pointer-events-none transition-colors duration-150 ${FOCUS}`;
export const BTN_SECONDARY = `inline-flex items-center justify-center gap-2 h-9 px-3 rounded-sm bg-surface-2 border border-hairline text-[13px] font-medium text-text-primary hover:bg-surface-3 hover:border-hairline-strong active:translate-y-px disabled:opacity-50 disabled:pointer-events-none transition-colors duration-150 ${FOCUS}`;
export const BTN_GHOST = `inline-flex items-center gap-1.5 h-8 px-2 rounded-sm text-[12px] font-medium transition-colors duration-150 ${FOCUS}`;

export const Panel: React.FC<{ title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }> = ({ title, description, action, children }) => (
  <section className="bg-surface-2 border border-hairline rounded-md">
    <header className="flex items-start justify-between gap-4 px-4 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-text-muted max-w-[65ch]">{description}</p>}
      </div>
      {action && <div className="flex-none flex items-center gap-2">{action}</div>}
    </header>
    <div className="px-4 pb-4">{children}</div>
  </section>
);

export const Field: React.FC<{ label: string; htmlFor: string; hint?: string; error?: string; children: React.ReactNode }> = ({ label, htmlFor, hint, error, children }) => (
  <div>
    <label htmlFor={htmlFor} className="block mb-1 text-[12px] font-medium text-text-secondary">{label}</label>
    {children}
    {error ? <p className="mt-1 text-[12px] text-error">{error}</p> : hint && <p className="mt-1 text-[12px] text-text-muted">{hint}</p>}
  </div>
);

export const ReadOnlyNote: React.FC = () => (
  <p role="status" className="px-3 py-2 rounded-sm border border-warning/40 bg-warning/10 text-[13px] text-text-primary">
    Mode lihat saja. Bagian ini hanya bisa diubah akun admin.
  </p>
);

export const ErrorLine: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-sm border border-error/40 bg-error/10 text-[13px] text-error">
    <span>{message}</span>
    <button type="button" onClick={onRetry} className={cn(BTN_GHOST, 'text-error hover:bg-error/10')}>
      <RotateCcw className="w-3.5 h-3.5" aria-hidden /> Coba lagi
    </button>
  </div>
);

export const SkeletonRows: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-2" aria-label="Memuat" aria-busy>
    {Array.from({ length: rows }, (_, i) => <div key={i} className="h-8 rounded-sm bg-surface-3 animate-pulse" />)}
  </div>
);

// Inclusive day range as "YYYY-MM-DD". Callers skip loading while `from` is after `to`.
export const DateRange: React.FC<{ from: string; to: string; onChange: (from: string, to: string) => void; today: string }> = ({ from, to, onChange, today }) => (
  <div role="group" aria-label="Rentang tanggal" className="flex items-center gap-1.5">
    <label htmlFor="range-from" className="sr-only">Dari tanggal</label>
    <input id="range-from" type="date" value={from} max={today} onChange={e => onChange(e.target.value, to)} className={cn(INPUT, 'h-8 w-[138px] font-mono tabular')} />
    <span className="text-[12px] text-text-muted" aria-hidden>sampai</span>
    <label htmlFor="range-to" className="sr-only">Sampai tanggal</label>
    <input id="range-to" type="date" value={to} max={today} onChange={e => onChange(from, e.target.value)} className={cn(INPUT, 'h-8 w-[138px] font-mono tabular')} />
    {(from !== today || to !== today) && (
      <button type="button" onClick={() => onChange(today, today)} className={cn(BTN_GHOST, 'whitespace-nowrap text-text-muted hover:text-text-primary hover:bg-surface-3')}>Hari ini</button>
    )}
  </div>
);

export const TH ='px-3 h-8 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted';
export const TD = 'px-3 h-10 text-[13px]';

// Dialog shell: title left, close right, Esc closes. Content decides its own form and footer.
export const Modal: React.FC<{ title: string; onClose: () => void; width?: number; children: React.ReactNode }> = ({ title, onClose, width = 440, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-h-[90vh] flex flex-col bg-surface-2 border border-hairline rounded-md shadow-modal" style={{ maxWidth: width }}>
        <header className="flex-none flex items-center justify-between px-4 h-12 border-b border-hairline">
          <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className={`w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3 ${FOCUS}`}>
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>
  );
};
