import React, { useState, useRef, useEffect } from 'react';
import {
  Settings, ChevronDown, BarChart2, ShoppingCart, MessageSquare, Receipt, Hamburger,
  Lock, ArrowLeftRight, Shield, Database, Users, Tag,
  Wifi, WifiOff, Minus, Square, Copy, X, Clock, Megaphone, LogOut, CalendarClock, Sun, Moon
} from 'lucide-react';
import { AppLogo } from '../../shared/ui/AppLogo';
import { applyTheme, getTheme, type Theme } from '../../shared/theme';

interface AppTopBarProps {
  operatorName: string;
  onlineCount: number;
  totalClients: number;
  unpaidCount?: number;
  pendingOrderCount?: number;
  pendingBookingCount?: number;
  unreadChatCount?: number;
  onOpenReport: () => void;
  onOpenPos: () => void;
  onOpenPendingOrders?: () => void;
  onOpenBookings?: () => void;
  onOpenPendingChat?: () => void;
  onLockServer: () => void;
  onOpenStaffModal: () => void;
  onOpenPriceModal: () => void;
  onOpenDatabaseModal: () => void;
  onOpenSecurityModal: () => void;
  onOpenShiftModal: () => void;
  shiftEnabled?: boolean; // hide shift handover for admin-only cafes
  onOpenBroadcastModal?: () => void;
  onExitServer?: () => void;
}

const BADGE = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-sm border text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export const AppTopBar: React.FC<AppTopBarProps> = ({
  operatorName,
  onlineCount,
  totalClients,
  unpaidCount = 0,
  pendingOrderCount = 0,
  pendingBookingCount = 0,
  unreadChatCount = 0,
  onOpenReport,
  onOpenPos,
  onOpenPendingOrders,
  onOpenBookings,
  onOpenPendingChat,
  onLockServer,
  onOpenStaffModal,
  onOpenPriceModal,
  onOpenDatabaseModal,
  onOpenSecurityModal,
  onOpenShiftModal,
  shiftEnabled = false,
  onOpenBroadcastModal,
  onExitServer,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [theme, setTheme] = useState<Theme>(getTheme);
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  const [currentTime, setCurrentTime] = useState(new Date());
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMinimize = () => {
    (window as any).electronAPI?.minimizeWindow?.();
  };

  const handleMaximize = () => {
    (window as any).electronAPI?.maximizeWindow?.();
    setIsMaximized(prev => !prev);
  };

  const handleClose = () => {
    if (onExitServer) {
      onExitServer();
    } else {
      (window as any).electronAPI?.closeWindow?.();
    }
  };

  const operatorInitials = operatorName
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header
      className="flex-none h-11 flex flex-col justify-between select-none z-50 border-b relative drag-region"
      style={{
        background: 'rgb(var(--gc-surface-1))',
        borderColor: 'rgb(var(--gc-hairline))',
      }}
    >
      <div className="flex-1 flex items-center justify-between pl-4 pr-0">
      {/* Left: Brand + health */}
      <div className="flex items-center space-x-3 no-drag-region">
        {/* Logo mark */}
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded bg-surface-2 border border-hairline-strong flex items-center justify-center p-0.5 shadow-sm flex-none">
            <AppLogo alt="GC Master Logo" />
          </div>
          <span className="text-[14px] font-extrabold tracking-tight text-text-primary">
            GC Hub
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-surface-2 text-primary border border-primary/30 shadow-sm">
            SERVER
          </span>
        </div>

        <div className="w-px h-4" style={{ background: 'rgb(var(--gc-hairline-strong))' }} />

        {/* Connection health */}
        <div className="flex items-center space-x-1.5">
          {totalClients === 0 ? (
            <>
              <div className="w-2 h-2 rounded-full bg-primary motion-safe:animate-pulse" />
              <span className="text-[12px] font-medium text-text-muted">
                Server Aktif • Menunggu Klien
              </span>
            </>
          ) : onlineCount > 0 ? (
            <>
              <Wifi className="w-3.5 h-3.5" style={{ color: 'rgb(var(--gc-primary))' }} />
              <span className="text-[12px] font-medium" style={{ color: 'rgb(var(--gc-text-secondary))' }}>
                {onlineCount}/{totalClients} Online
              </span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" style={{ color: 'rgb(var(--gc-warning))' }} />
              <span className="text-[12px] font-medium" style={{ color: 'rgb(var(--gc-warning))' }}>
                0/{totalClients} Online • Offline
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right: Alerts + operator + settings + window controls */}
      <div className="flex items-center space-x-1.5 h-full no-drag-region">
        {/* Alert badges: only shown when something waits on the cashier. Colors per DESIGN.md, no pulsing. */}
        {unpaidCount > 0 && (
          <span
            role="status"
            aria-label={`${unpaidCount} PC belum bayar`}
            className={`${BADGE} bg-warning text-on-primary border-warning`}
          >
            <Receipt className="w-3.5 h-3.5" aria-hidden />
            <span className="font-mono">{unpaidCount}</span>
            <span>Belum bayar</span>
          </span>
        )}

        {pendingOrderCount > 0 && (
          <button
            type="button"
            onClick={onOpenPendingOrders || onOpenPos}
            aria-label={`${pendingOrderCount} pesanan F&B menunggu konfirmasi kasir`}
            title="Pesanan F&B menunggu konfirmasi"
            className={`${BADGE} cursor-pointer active:translate-y-px bg-warning/15 text-warning border-warning/40 hover:bg-warning/25`}
          >
            <Hamburger className="w-3.5 h-3.5" aria-hidden />
            <span className="font-mono">{pendingOrderCount}</span>
            <span>Pesanan</span>
          </button>
        )}

        {/* Antrean booking online: selalu tersedia, menyala bila ada yang menunggu */}
        {onOpenBookings && (
          <button
            type="button"
            onClick={onOpenBookings}
            aria-label={pendingBookingCount > 0 ? `${pendingBookingCount} booking online menunggu` : 'Buka antrean booking online'}
            className={`${BADGE} cursor-pointer active:translate-y-px ${
              pendingBookingCount > 0
                ? 'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25'
                : 'bg-transparent text-text-muted border-hairline hover:bg-surface-3 hover:text-text-primary'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" aria-hidden />
            {pendingBookingCount > 0 && <span className="font-mono">{pendingBookingCount}</span>}
            <span>Booking</span>
          </button>
        )}

        {unreadChatCount > 0 && (
          <button
            type="button"
            onClick={onOpenPendingChat}
            aria-label={`${unreadChatCount} pesan chat masuk dari bilik`}
            title="Chat masuk dari bilik"
            className={`${BADGE} cursor-pointer active:translate-y-px bg-primary/15 text-primary border-primary/40 hover:bg-primary/25`}
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden />
            <span className="font-mono">{unreadChatCount}</span>
            <span>Chat</span>
          </button>
        )}

        {/* Live Realtime Clock */}
        <div className="flex items-center space-x-2 px-2.5 py-1 bg-surface-2 border border-hairline rounded text-text-secondary font-mono text-[12px] shadow-sm">
          <Clock className="w-3.5 h-3.5 text-primary" aria-hidden />
          <span className="font-bold text-text-primary tracking-wider">
            {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="text-text-muted text-[11px] font-sans border-l border-hairline pl-2">
            {currentTime.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>

        <div className="w-px h-4" style={{ background: 'rgb(var(--gc-hairline))' }} />

        {/* Operator chip */}
        <div className="flex items-center space-x-2 px-2 py-1 rounded cursor-default"
          style={{ color: 'rgb(var(--gc-text-secondary))' }}>
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-none"
            style={{ background: 'rgb(var(--gc-surface-3))', border: '1px solid rgb(var(--gc-hairline-strong))', color: 'rgb(var(--gc-primary))' }}>
            {operatorInitials}
          </div>
          <span className="text-[12px] font-medium max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap">
            {operatorName}
          </span>
        </div>

        {/* Settings dropdown */}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setIsSettingsOpen(v => !v)}
            className="flex items-center space-x-0.5 p-1.5 rounded transition"
            style={{
              color: isSettingsOpen ? 'rgb(var(--gc-text-primary))' : 'rgb(var(--gc-text-muted))',
              background: isSettingsOpen ? 'rgb(var(--gc-surface-2))' : 'transparent',
            }}
          >
            <Settings className="w-4 h-4" />
            <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isSettingsOpen ? 'rotate-180' : ''}`} />
          </button>

          {isSettingsOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded py-1 z-50 shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
              style={{ background: 'rgb(var(--gc-surface-2))', border: '1px solid rgb(var(--gc-hairline-strong))', color: 'rgb(var(--gc-text-secondary))' }}>
              {/* Quick actions */}
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgb(var(--gc-text-disabled))', letterSpacing: '0.08em' }}>
                Aksi Cepat
              </div>

              {[
                { icon: BarChart2, label: 'Laporan Pendapatan', color: 'rgb(var(--gc-primary))', fn: onOpenReport },
                { icon: ShoppingCart, label: 'POS Kasir Counter', color: 'rgb(var(--gc-primary))', fn: onOpenPos },
                { icon: Megaphone, label: 'Siaran Pengumuman', color: 'rgb(var(--gc-info))', fn: () => onOpenBroadcastModal?.() },
                ...(shiftEnabled ? [{ icon: ArrowLeftRight, label: 'Ganti Shift', color: 'rgb(var(--gc-warning))', fn: onOpenShiftModal }] : []),
              ].map(({ icon: Icon, label, color, fn }) => (
                <button key={label}
                  onClick={() => { fn(); setIsSettingsOpen(false); }}
                  className="w-full text-left px-3 py-1.5 flex items-center space-x-2.5 transition text-[12px]"
                  style={{ color: 'rgb(var(--gc-text-secondary))' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgb(var(--gc-surface-3))')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <Icon className="w-3.5 h-3.5 flex-none" style={{ color }} />
                  <span>{label}</span>
                </button>
              ))}

              <div className="my-1" style={{ borderTop: '1px solid rgb(var(--gc-hairline))' }} />
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgb(var(--gc-text-disabled))', letterSpacing: '0.08em' }}>
                Pengaturan
              </div>

              {[
                { icon: Users, label: 'Manajemen Staff', fn: onOpenStaffModal },
                { icon: Tag, label: 'Pengaturan Harga', fn: onOpenPriceModal },
                theme === 'dark'
                  ? { icon: Sun, label: 'Tema Terang', fn: toggleTheme }
                  : { icon: Moon, label: 'Tema Gelap', fn: toggleTheme },
                { icon: Shield, label: 'Kunci LAN', fn: onOpenSecurityModal },
                { icon: Database, label: 'Backup Database', fn: onOpenDatabaseModal },
              ].map(({ icon: Icon, label, fn }) => (
                <button key={label}
                  onClick={() => { fn(); setIsSettingsOpen(false); }}
                  className="w-full text-left px-3 py-1.5 flex items-center space-x-2.5 transition text-[12px]"
                  style={{ color: 'rgb(var(--gc-text-secondary))' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgb(var(--gc-surface-3))')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <Icon className="w-3.5 h-3.5 flex-none" style={{ color: 'rgb(var(--gc-text-muted))' }} />
                  <span>{label}</span>
                </button>
              ))}

              <div className="my-1" style={{ borderTop: '1px solid rgb(var(--gc-hairline))' }} />
              <button onClick={() => { onLockServer(); setIsSettingsOpen(false); }}
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2.5 transition text-[12px]"
                style={{ color: 'rgb(var(--gc-warning))' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgb(var(--gc-warning) / 0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <Lock className="w-3.5 h-3.5 flex-none" />
                <span>Kunci Server Saja</span>
              </button>

              <button onClick={() => { if (onExitServer) onExitServer(); else handleClose(); setIsSettingsOpen(false); }}
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2.5 transition text-[12px]"
                style={{ color: 'rgb(var(--gc-error))' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgb(var(--gc-error) / 0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <LogOut className="w-3.5 h-3.5 flex-none" />
                <span>Tutup Server &amp; Keluar</span>
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-full bg-hairline my-auto" />

        {/* Window Control Buttons (Modern Undecorated Title Bar) */}
        <div className="flex items-center h-full">
          <button
            onClick={handleMinimize}
            title="Minimize"
            className="w-10 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
            className="w-10 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
          </button>
          <button
            onClick={handleClose}
            title="Close"
            className="w-10 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-error transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      </div>
    </header>
  );
};
