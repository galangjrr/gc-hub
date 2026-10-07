import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  Cpu,
  Globe,
  GripVertical,
  Headphones,
  Lock,
  LogOut,
  MessageCircle,
  Mic,
  Minus,
  Play,
  Plus,
  Power,
  Send,
  Settings,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from 'lucide-react';
import { SessionData, OpCode } from '../../shared/protocol';
import type { ProductCategoryItem, ProductItem } from '../../shared/types';
import { ClientNetworkService } from '../network/clientNetwork';
import { formatClock } from './LockLayout';

// Widget sesi aktif. Jendelanya selalu di bawah semua jendela lain (hanya di atas wallpaper),
// diatur main process. Jendela Electron mengikuti ukuran widget (diukur ResizeObserver),
// jadi lebar dibuat tetap supaya posisi hasil geser tidak di-reset.

export interface ClientCatalog {
  products: ProductItem[];
  categories: ProductCategoryItem[];
}

type View = 'main' | 'chat' | 'order' | 'audio' | 'lock' | 'logout';

const VIEW_TITLE: Record<Exclude<View, 'main'>, string> = {
  chat: 'Chat kasir',
  order: 'Pesan makanan',
  audio: 'Suara',
  lock: 'Kunci layar',
  logout: 'Selesai main',
};

interface ChatMessage {
  fromOperator: boolean;
  sender: string;
  time: string;
  text: string;
}

interface FloatingCapsuleProps {
  session: SessionData;
  /** null = katalog belum diterima dari server. */
  catalog: ClientCatalog | null;
  onTriggerAfkLock: (pin: string) => void;
  onLogout: () => void;
  onCloseApp: () => void;
  onOpenTaskManager: () => void;
  onOpenConfig: () => void;
  /** Mode Teknisi aktif (dibuka ClientView setelah akun admin terverifikasi). */
  isTechMode: boolean;
  onStartTechMode: () => void;
  onEndTechMode: () => void;
  /** Ukuran widget berubah: ClientView menyesuaikan jendela Electron. */
  onLayout: (opts: OverlayLayout) => void;
  /** Notifikasi selama sesi, pengganti dialog layar penuh. */
  toasts: WidgetToast[];
  onDismissToast: (id: number) => void;
}

const TOAST_TONE: Record<WidgetToast['type'], string> = {
  info: 'border-l-info',
  success: 'border-l-primary',
  confirm: 'border-l-warning',
  warning: 'border-l-warning',
  error: 'border-l-error',
};

const ToastList: React.FC<{ toasts: WidgetToast[]; onDismiss: (id: number) => void }> = ({ toasts, onDismiss }) => (
  <div className="space-y-1 mb-1">
    {toasts.map(t => (
      <div
        key={t.id}
        role={t.type === 'error' || t.type === 'warning' ? 'alert' : 'status'}
        className={`flex items-start gap-2 pl-3 pr-1 py-2 rounded-md bg-surface-1 border border-hairline-strong border-l-4 shadow-modal ${TOAST_TONE[t.type]}`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-text-primary">{t.title}</p>
          {t.message && <p className="text-[13px] text-text-secondary break-words">{t.message}</p>}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(t.id)}
          aria-label="Tutup notifikasi"
          className="w-7 h-7 flex-none flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    ))}
  </div>
);

export interface WidgetToast {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
}

export interface OverlayLayout {
  isIsland: boolean;
  width: number;
  height: number;
}

const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
const clockNow = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

const playChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // audio diblokir: chime hanya pemanis
  }
};

const tileClass =
  'relative h-14 flex flex-col items-center justify-center gap-1 rounded-sm bg-surface-2 border border-hairline text-[11px] text-text-secondary hover:bg-surface-3 hover:border-hairline-strong transition-colors duration-150 active:translate-y-px';
const inputClass =
  'w-full h-9 px-3 bg-surface-3 border border-hairline rounded-sm text-sm text-text-primary outline-none focus:border-primary transition-colors duration-150';
const primaryBtn =
  'h-9 px-4 flex items-center justify-center gap-2 rounded-sm bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold transition-colors duration-150 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed';
const secondaryBtn =
  'h-9 px-4 flex items-center justify-center gap-2 rounded-sm bg-surface-2 border border-hairline text-sm text-text-secondary hover:bg-surface-3 transition-colors duration-150 active:translate-y-px';
const ghostBtn =
  'h-8 px-2 flex items-center gap-1.5 rounded-sm text-xs text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors duration-150';

export const FloatingCapsule: React.FC<FloatingCapsuleProps> = ({
  session,
  catalog,
  onTriggerAfkLock,
  onLogout,
  onCloseApp,
  onOpenTaskManager,
  onOpenConfig,
  isTechMode,
  onStartTechMode,
  onEndTechMode,
  onLayout,
  toasts,
  onDismissToast,
}) => {
  const [view, setView] = useState<View>('main');
  const [isIsland, setIsIsland] = useState(false);
  const widgetRef = useRef<HTMLElement>(null);

  const isStaff = session.userType === 'admin' || session.userType === 'admin_local' || session.username?.toUpperCase() === 'ADMIN';
  const isPrepaid = ['prepaid', 'package', 'member'].includes(session.billingType as string) && session.remainingSeconds !== undefined;
  const elapsed = session.elapsedSeconds ?? session.timeUsedMinutes * 60;
  const mainSeconds = isPrepaid ? session.remainingSeconds! : elapsed;
  const lowTime = isPrepaid && mainSeconds <= 300;
  const cost = session.totalSpent || session.moneyUsed || 0;
  const displayName = isStaff ? session.username || 'Staf' : session.username || session.pcId || 'Tamu';

  // ─── Jendela mengikuti ukuran widget ───────────────────────────────
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  useLayoutEffect(() => {
    const el = widgetRef.current;
    if (!el) return;
    const sync = () => onLayoutRef.current({
      isIsland,
      width: Math.ceil(el.offsetWidth),
      height: Math.ceil(el.offsetHeight),
    });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isIsland]);

  // ─── Geser jendela ─────────────────────────────────────────────────
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const onDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, a')) return;
    dragRef.current = { x: e.screenX, y: e.screenY };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.screenX - dragRef.current.x;
      const dy = ev.screenY - dragRef.current.y;
      dragRef.current = { x: ev.screenX, y: ev.screenY };
      if (dx || dy) (window as any).electronAPI?.moveWindow?.(dx, dy);
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ─── Chat ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const viewRef = useRef(view);
  viewRef.current = view;
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => ClientNetworkService.on(OpCode.REMOTE_COMMAND, (packet) => {
    if (packet.payload?.action !== 'send_message') return;
    const params = packet.payload.params || {};
    setMessages(prev => [...prev, { fromOperator: true, sender: params.sender || 'Kasir', time: clockNow(), text: params.message || '' }]);
    playChime();
    if (viewRef.current !== 'chat') setHasUnread(true);
  }), []);

  useEffect(() => {
    if (view !== 'chat') return;
    setHasUnread(false);
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [view, messages.length]);

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    const sender = session.username || session.pcId || 'Pemain';
    setMessages(prev => [...prev, { fromOperator: false, sender, time: clockNow(), text }]);
    ClientNetworkService.send(OpCode.REMOTE_COMMAND, {
      action: 'client_chat_reply',
      params: { pcId: session.pcId, sender, text, timestamp: Date.now() },
    });
    setChatInput('');
  };

  // ─── Pesan F&B ─────────────────────────────────────────────────────
  const [categoryId, setCategoryId] = useState<number | 'all'>('all');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [orderSent, setOrderSent] = useState(false);
  const products = useMemo(() => (catalog?.products || []).filter(p => p.enabled), [catalog]);
  const shownProducts = categoryId === 'all' ? products : products.filter(p => p.categoryId === categoryId);
  const usedCategories = (catalog?.categories || []).filter(c => products.some(p => p.categoryId === c.id));
  const cartLines = products.filter(p => cart[p.id]).map(p => ({ product: p, qty: cart[p.id] }));
  const cartTotal = cartLines.reduce((sum, l) => sum + l.product.unitPrice * l.qty, 0);
  const cartCount = cartLines.reduce((sum, l) => sum + l.qty, 0);

  const changeQty = (id: number, delta: number) => {
    setOrderSent(false);
    setCart(prev => {
      const next = Math.min(99, Math.max(0, (prev[id] || 0) + delta));
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  };

  const submitOrder = () => {
    if (cartLines.length === 0) return;
    // Server menghitung ulang nama dan harga dari katalog; client hanya kirim id dan jumlah
    ClientNetworkService.send(OpCode.ORDER_REQUEST, {
      items: cartLines.map(l => ({ id: l.product.id, quantity: l.qty })),
    });
    setCart({});
    setOrderSent(true);
  };

  // ─── Suara ─────────────────────────────────────────────────────────
  const [volume, setVolume] = useState(50); // cleanup sesi selalu mengembalikan volume Windows ke 50
  const [isMuted, setIsMuted] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[] | null>(null);
  const [micId, setMicId] = useState('');
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const volTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyVolume = (vol: number, muted: boolean) => {
    setVolume(vol);
    setIsMuted(muted);
    if (volTimer.current) clearTimeout(volTimer.current);
    volTimer.current = setTimeout(() => (window as any).electronAPI?.setSystemVolume?.(vol, muted), 120);
  };

  useEffect(() => {
    if (view !== 'audio') {
      setMicTesting(false);
      return;
    }
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMics([]);
      return;
    }
    navigator.mediaDevices.enumerateDevices()
      .then(list => setMics(list.filter(d => d.kind === 'audioinput')))
      .catch(() => setMics([]));
  }, [view]);

  useEffect(() => {
    if (!micTesting) {
      setMicLevel(0);
      return;
    }
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    navigator.mediaDevices.getUserMedia({ audio: micId ? { deviceId: { exact: micId } } : true })
      .then(s => {
        stream = s;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicLevel(Math.min(100, Math.round((avg / 96) * 100)));
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => setMicTesting(false));
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [micTesting, micId]);

  // ─── Kunci layar ───────────────────────────────────────────────────
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');

  const submitLock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return setPinError('PIN minimal 4 digit.');
    if (pin !== pinConfirm) return setPinError('Ulangi PIN belum sama.');
    onTriggerAfkLock(pin);
    setPin('');
    setPinConfirm('');
    setPinError('');
    setView('main');
  };

  const openTool = (tool: 'sound' | 'settings' | 'devmgmt' | 'network') => (window as any).electronAPI?.openAdminTool?.(tool);

  // ─── Island (dikecilkan) ───────────────────────────────────────────
  if (isIsland) {
    return (
      <aside ref={widgetRef} aria-label="Widget GC Hub, dikecilkan" className="w-[240px] p-1 select-none font-sans">
        <ToastList toasts={toasts} onDismiss={onDismissToast} />
        <button
          type="button"
          onClick={() => setIsIsland(false)}
          title="Buka widget"
          className={`w-full h-10 px-3 flex items-center gap-2 rounded-md bg-surface-1 border text-left transition-colors duration-150 hover:bg-surface-2 ${
            isTechMode ? 'border-warning' : 'border-hairline-strong'
          }`}
        >
          <span className="flex-1 min-w-0 text-[13px] font-medium text-text-primary truncate">{displayName}</span>
          <span className={`font-mono tabular text-[13px] font-medium ${lowTime ? 'text-warning' : 'text-text-primary'}`}>
            {formatClock(mainSeconds)}
          </span>
          {hasUnread && <span aria-label="Pesan baru" className="w-2 h-2 rounded-full bg-primary" />}
        </button>
      </aside>
    );
  }

  // ─── Widget penuh ──────────────────────────────────────────────────
  return (
    <aside ref={widgetRef} aria-label="Widget sesi GC Hub" className="w-[340px] p-1 select-none font-sans">
      <ToastList toasts={toasts} onDismiss={onDismissToast} />
      <div className={`flex flex-col max-h-[600px] rounded-md bg-surface-1 border overflow-hidden ${isTechMode ? 'border-warning' : 'border-hairline-strong'}`}>
        <header onMouseDown={onDragStart} className="h-11 flex-none flex items-center gap-2 pl-2 pr-1 border-b border-hairline bg-surface-2 cursor-move">
          {view === 'main' ? (
            <>
              <GripVertical aria-hidden="true" className="w-4 h-4 flex-none text-text-disabled" />
              <span className="flex-1 min-w-0 text-[13px] font-semibold text-text-primary truncate" title={displayName}>{displayName}</span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setView('main')}
                aria-label="Kembali"
                className="w-8 h-8 flex-none flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="flex-1 min-w-0 text-[13px] font-semibold text-text-primary truncate">{VIEW_TITLE[view]}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => { setView('main'); setIsIsland(true); }}
            title="Kecilkan"
            aria-label="Kecilkan widget"
            className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3"
          >
            <Minus className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {view === 'main' && (
            <div className="p-3 space-y-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">{isPrepaid ? 'Sisa waktu' : 'Waktu terpakai'}</p>
                <p className={`font-mono tabular text-[32px] leading-tight font-medium ${lowTime ? 'text-warning' : 'text-text-primary'}`}>
                  {formatClock(mainSeconds)}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2 text-[13px] text-text-muted">
                  <span>
                    {isPrepaid
                      ? <>Terpakai <span className="font-mono tabular text-text-secondary">{formatClock(elapsed)}</span></>
                      : 'Tagihan dibayar di kasir saat selesai'}
                  </span>
                  {!isStaff && cost > 0 && <span className="font-mono tabular text-text-secondary">{rupiah(cost)}</span>}
                </div>
              </div>

              {isTechMode && (
                <div className="p-2.5 rounded-sm bg-warning/10 border border-warning/40 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                      <Wrench className="w-4 h-4 text-warning" /> Mode teknisi aktif
                    </span>
                    <button type="button" onClick={onEndTechMode} className="h-8 px-3 rounded-sm bg-warning text-surface-1 text-xs font-semibold hover:bg-warning/90 active:translate-y-px">
                      Kunci lagi
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([['sound', 'Panel suara', Volume2], ['settings', 'Pengaturan Windows', Settings], ['devmgmt', 'Device Manager', Cpu], ['network', 'Koneksi jaringan', Globe]] as const).map(([tool, label, Icon]) => (
                      <button key={tool} type="button" onClick={() => openTool(tool)} className="h-8 px-2 flex items-center gap-1.5 rounded-sm bg-surface-2 border border-hairline text-xs text-text-secondary hover:bg-surface-3">
                        <Icon className="w-3.5 h-3.5 flex-none" /> <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <nav aria-label="Menu sesi" className="grid grid-cols-3 gap-1.5">
                <button type="button" onClick={() => setView('chat')} className={tileClass}>
                  <MessageCircle className="w-4 h-4" />
                  Chat
                  {hasUnread && <span aria-label="Pesan baru" className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />}
                </button>
                <button type="button" onClick={() => setView('order')} className={tileClass}>
                  <UtensilsCrossed className="w-4 h-4" />
                  Pesan
                </button>
                <button type="button" onClick={() => setView('audio')} className={tileClass}>
                  <Headphones className="w-4 h-4" />
                  Suara
                </button>
                <button type="button" onClick={() => setView('lock')} className={tileClass}>
                  <Lock className="w-4 h-4" />
                  Kunci
                </button>
                <button type="button" onClick={() => setView('logout')} className={`${tileClass} hover:text-error`}>
                  <LogOut className="w-4 h-4" />
                  Selesai
                </button>
                {isStaff && (
                  <button type="button" onClick={onOpenTaskManager} className={tileClass}>
                    <Activity className="w-4 h-4" />
                    Task Manager
                  </button>
                )}
              </nav>

              <div className="flex items-center gap-1 pt-2 border-t border-hairline">
                {!isTechMode && (
                  <button type="button" onClick={onStartTechMode} className={ghostBtn}>
                    <Wrench className="w-3.5 h-3.5" /> Mode teknisi
                  </button>
                )}
                {isStaff && (
                  <>
                    <button type="button" onClick={onOpenConfig} className={ghostBtn}>
                      <Settings className="w-3.5 h-3.5" /> Pengaturan
                    </button>
                    <button type="button" onClick={onCloseApp} className={`${ghostBtn} ml-auto hover:text-error`}>
                      <Power className="w-3.5 h-3.5" /> Tutup app
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {view === 'chat' && (
            <div className="p-3 space-y-2">
              <div role="log" aria-live="polite" className="h-64 overflow-y-auto rounded-sm bg-canvas border border-hairline p-2 space-y-2">
                {messages.length === 0 ? (
                  <p className="h-full flex items-center justify-center text-center text-[13px] text-text-muted px-4">
                    Belum ada pesan. Tulis di bawah untuk menghubungi kasir.
                  </p>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={m.fromOperator ? '' : 'text-right'}>
                      <p className="text-[11px] text-text-muted">
                        <span className={`font-medium ${m.fromOperator ? 'text-primary' : 'text-text-secondary'}`}>{m.fromOperator ? m.sender : 'Kamu'}</span>
                        {' '}<span className="font-mono tabular">{m.time}</span>
                      </p>
                      <p className="text-[13px] text-text-primary break-words">{m.text}</p>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendChat} className="flex gap-1.5">
                <label htmlFor="chat-input" className="sr-only">Pesan ke kasir</label>
                <input id="chat-input" autoFocus autoComplete="off" maxLength={300} value={chatInput} onChange={e => setChatInput(e.target.value)} className={inputClass} />
                <button type="submit" aria-label="Kirim" disabled={!chatInput.trim()} className={`${primaryBtn} px-3`}>
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {view === 'order' && (
            <div className="p-3 space-y-2">
              {catalog === null ? (
                <div aria-busy="true" aria-label="Memuat menu" className="space-y-2">
                  {[0, 1, 2, 3].map(i => <div key={i} className="h-10 rounded-sm bg-surface-3 animate-pulse" />)}
                </div>
              ) : products.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-text-muted">Menu belum diisi kasir. Tanya kasir langsung untuk pesan.</p>
              ) : (
                <>
                  {usedCategories.length > 1 && (
                    <div role="tablist" aria-label="Kategori" className="flex gap-1 overflow-x-auto pb-1">
                      {[{ id: 'all' as const, name: 'Semua' }, ...usedCategories].map(c => (
                        <button
                          key={c.id}
                          type="button"
                          role="tab"
                          aria-selected={categoryId === c.id}
                          onClick={() => setCategoryId(c.id)}
                          className={`h-7 px-2.5 flex-none rounded-xs text-xs border transition-colors duration-150 ${
                            categoryId === c.id ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-surface-2 border-hairline text-text-muted hover:text-text-primary'
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <ul className="max-h-60 overflow-y-auto divide-y divide-hairline border border-hairline rounded-sm">
                    {shownProducts.map(p => (
                      <li key={p.id} className="flex items-center gap-2 px-2.5 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-text-primary truncate" title={p.name}>{p.name}</p>
                          <p className="font-mono tabular text-xs text-text-muted">{rupiah(p.unitPrice)}</p>
                        </div>
                        {cart[p.id] ? (
                          <div className="flex items-center gap-1">
                            <button type="button" aria-label={`Kurangi ${p.name}`} onClick={() => changeQty(p.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-sm bg-surface-3 text-text-secondary hover:text-text-primary"><Minus className="w-3.5 h-3.5" /></button>
                            <span className="w-6 text-center font-mono tabular text-[13px] text-text-primary">{cart[p.id]}</span>
                            <button type="button" aria-label={`Tambah ${p.name}`} onClick={() => changeQty(p.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-sm bg-surface-3 text-text-secondary hover:text-text-primary"><Plus className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <button type="button" aria-label={`Tambah ${p.name}`} onClick={() => changeQty(p.id, 1)} className="h-7 px-2.5 flex items-center gap-1 rounded-sm border border-hairline text-xs text-text-secondary hover:border-primary hover:text-primary">
                            <Plus className="w-3.5 h-3.5" /> Tambah
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {orderSent && cartCount === 0 && (
                    <p role="status" className="text-[13px] text-text-secondary">Pesanan terkirim. Tunggu konfirmasi kasir.</p>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[13px] text-text-muted">
                      {cartCount > 0 ? <>{cartCount} item <span className="font-mono tabular text-text-primary">{rupiah(cartTotal)}</span></> : 'Belum ada yang dipilih'}
                    </p>
                    <button type="button" onClick={submitOrder} disabled={cartCount === 0} className={primaryBtn}>Pesan</button>
                  </div>
                </>
              )}
            </div>
          )}

          {view === 'audio' && (
            <div className="p-3 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="vol" className="text-[13px] font-medium text-text-secondary">Volume Windows</label>
                  <span className="font-mono tabular text-[13px] text-text-muted">{isMuted ? 'Senyap' : `${volume}%`}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => applyVolume(volume, !isMuted)}
                    aria-label={isMuted ? 'Nyalakan suara' : 'Senyapkan'}
                    aria-pressed={isMuted}
                    className={`w-9 h-9 flex-none flex items-center justify-center rounded-sm border ${isMuted ? 'bg-error/10 border-error/40 text-error' : 'bg-surface-2 border-hairline text-text-secondary hover:bg-surface-3'}`}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    id="vol"
                    type="range"
                    min={0}
                    max={100}
                    value={isMuted ? 0 : volume}
                    onChange={e => applyVolume(Number(e.target.value), false)}
                    className="flex-1 accent-primary"
                  />
                </div>
                <button type="button" onClick={playChime} className={`${secondaryBtn} w-full`}>
                  <Play className="w-4 h-4" /> Tes suara headset
                </button>
              </div>

              <div className="space-y-2 pt-3 border-t border-hairline">
                <label htmlFor="mic" className="text-[13px] font-medium text-text-secondary">Tes mikrofon</label>
                {mics === null ? (
                  <div aria-busy="true" className="h-9 rounded-sm bg-surface-3 animate-pulse" />
                ) : mics.length === 0 ? (
                  <p className="text-[13px] text-text-muted">Mikrofon tidak terdeteksi. Cek colokan headset.</p>
                ) : (
                  <>
                    <select id="mic" value={micId} onChange={e => setMicId(e.target.value)} className={inputClass}>
                      {mics.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Mikrofon ${i + 1}`}</option>)}
                    </select>
                    <button type="button" onClick={() => setMicTesting(t => !t)} aria-pressed={micTesting} className={`${secondaryBtn} w-full`}>
                      <Mic className="w-4 h-4" /> {micTesting ? 'Stop tes' : 'Mulai tes, lalu bicara'}
                    </button>
                    {micTesting && (
                      <div role="meter" aria-label="Level mikrofon" aria-valuenow={micLevel} aria-valuemin={0} aria-valuemax={100} className="h-2 rounded-xs bg-surface-3 overflow-hidden">
                        <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${micLevel}%` }} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {view === 'lock' && (
            <form onSubmit={submitLock} className="p-3 space-y-3" noValidate>
              <p className="text-[13px] text-text-muted">Kunci layar saat meninggalkan PC. Waktu sesi tetap berjalan.</p>
              <div className="space-y-1.5">
                <label htmlFor="lock-pin" className="block text-[13px] font-medium text-text-secondary">PIN</label>
                <input id="lock-pin" type="password" inputMode="numeric" autoFocus autoComplete="off" value={pin} onChange={e => { setPin(e.target.value); setPinError(''); }} className={`${inputClass} font-mono tracking-[0.3em]`} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lock-pin2" className="block text-[13px] font-medium text-text-secondary">Ulangi PIN</label>
                <input id="lock-pin2" type="password" inputMode="numeric" autoComplete="off" value={pinConfirm} onChange={e => { setPinConfirm(e.target.value); setPinError(''); }} className={`${inputClass} font-mono tracking-[0.3em]`} />
              </div>
              {pinError && <p role="alert" className="text-[13px] text-error">{pinError}</p>}
              <button type="submit" className={`${primaryBtn} w-full`}>
                <Lock className="w-4 h-4" /> Kunci sekarang
              </button>
            </form>
          )}

          {view === 'logout' && (
            <div className="p-3 space-y-3">
              <p className="text-[13px] text-text-secondary">
                Sesi diakhiri dan PC dikunci.{!isPrepaid && !isStaff && ' Tagihan dibayar di kasir.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" autoFocus onClick={() => setView('main')} className={secondaryBtn}>Batal</button>
                <button type="button" onClick={() => { setView('main'); onLogout(); }} className="h-9 px-4 rounded-sm bg-error hover:bg-error/90 text-white text-sm font-semibold active:translate-y-px">
                  Ya, selesai
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
