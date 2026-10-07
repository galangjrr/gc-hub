import React, { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { AppLogo } from '../../shared/ui/AppLogo';

// Kerangka layar kunci kiosk (DESIGN.md bagian 6): kolom kiri sepertiga untuk form,
// panel merek di kanan. Dipakai layar standby dan layar AFK.

export const formatClock = (totalSec: number) => {
  const sec = Math.max(0, Math.floor(totalSec));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
};

interface LockLayoutProps {
  pcLabel: string;
  isConnected: boolean;
  serverIp: string;
  onOpenSettings?: () => void;
  footer?: React.ReactNode;
  /** Isi kiri bawah panel merek. */
  info: React.ReactNode;
  children: React.ReactNode;
}

export const LockLayout: React.FC<LockLayoutProps> = ({ pcLabel, isConnected, serverIp, onOpenSettings, footer, info, children }) => {
  const [now, setNow] = useState(() => new Date());

  // cukup presisi menit, tick 10 detik supaya murah di PC kentang
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="w-full h-full flex bg-canvas overflow-hidden">
      <aside className="relative z-10 w-1/3 min-w-[380px] max-w-[480px] h-full flex flex-col bg-surface-1 border-r border-hairline">
        <header className="flex items-center justify-between px-8 pt-8">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 flex-none rounded-sm bg-surface-2 border border-hairline p-1.5">
              <AppLogo alt="GC Net" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">Bilik</p>
              <p className="text-[15px] font-semibold text-text-primary truncate" title={pcLabel}>{pcLabel}</p>
            </div>
          </div>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              title="Pengaturan LAN dan PC, khusus admin"
              aria-label="Pengaturan LAN dan PC, khusus admin"
              className="w-11 h-11 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors duration-150"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </header>

        <div className="flex-1 flex flex-col justify-center px-8">{children}</div>

        {footer && (
          <footer className="flex items-center gap-2 px-8 pb-8 pt-4 border-t border-hairline">{footer}</footer>
        )}
      </aside>

      <section aria-label="Info bilik" className="relative flex-1 h-full overflow-hidden">
        {/* Video merek warnet. Disembunyikan di reduced motion lewat CSS. */}
        <video autoPlay loop muted playsInline aria-hidden="true" className="gc-lock-video absolute inset-0 w-full h-full object-cover pointer-events-none">
          <source src="/logo/GC%20Net%20Logo.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-canvas/60" />

        <div className="relative h-full flex flex-col justify-between p-10">
          <div className="self-end text-right">
            <p className="font-mono tabular text-[56px] leading-none font-medium text-text-primary">
              {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">{info}</div>
            <div role="status" className="flex-none flex items-center gap-2 h-9 px-3 rounded-sm bg-surface-1/80 border border-hairline text-sm">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-primary' : 'bg-error'}`} />
              {isConnected ? (
                <span className="text-text-secondary">Terhubung ke kasir <span className="font-mono tabular text-text-muted">{serverIp}</span></span>
              ) : (
                <span className="text-text-secondary">Kasir tidak terhubung</span>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
