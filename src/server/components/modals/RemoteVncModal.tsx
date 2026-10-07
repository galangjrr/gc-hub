import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Workstation } from '../../../shared/types';
import {
  X, RefreshCw, Camera, Lock, Unlock, MessageSquare, Activity, Power, RotateCcw,
  MousePointer, Eye, Send, Maximize2, Minimize2,
} from 'lucide-react';
import { OpCode } from '../../../shared/protocol';
import { ConfirmModal } from '../../../shared/ui/ConfirmModal';
import { BTN_GHOST, FOCUS, INPUT } from '../../../shared/ui/primitives';
import { isCaptureFor, ScreenCaptureUpdate } from './ScreenshotViewerModal';
import { cn } from '../../../shared/ui/utils';

interface RemoteVncModalProps {
  isOpen: boolean;
  pc: Workstation | null;
  onClose: () => void;
  onOpenChat?: (pc: Workstation) => void;
  onOpenTaskManager?: (pc: Workstation) => void;
  onLockWorkstation?: (pc: Workstation) => void;
  onUnlockWorkstation?: (pc: Workstation) => void;
  onRestartWorkstation?: (pc: Workstation) => void;
  onShutdownWorkstation?: (pc: Workstation) => void;
}

type Scaling = 'fit' | 'fill' | 'original';

const STREAM_PRESETS = [
  { ms: 150, label: 'Cepat' },
  { ms: 300, label: 'Lancar' },
  { ms: 600, label: 'Hemat' },
];
const SCALING: { id: Scaling; label: string }[] = [
  { id: 'fit', label: 'Pas' },
  { id: 'fill', label: 'Penuh' },
  { id: 'original', label: '1:1' },
];
const COMBOS: { label: string; keys: number[]; danger?: boolean }[] = [
  { label: 'Ctrl+Alt+Del', keys: [17, 18, 46], danger: true },
  { label: 'Ctrl+Shift+Esc', keys: [17, 16, 27] },
  { label: 'Win+D', keys: [91, 68] },
  { label: 'Win+E', keys: [91, 69] },
  { label: 'Win+R', keys: [91, 82] },
  { label: 'Alt+Tab', keys: [18, 9] },
  { label: 'Alt+F4', keys: [18, 115] },
];
const SINGLE_KEYS: { label: string; code: number }[] = [
  { label: 'Win', code: 91 },
  { label: 'Esc', code: 27 },
  { label: 'Enter', code: 13 },
  { label: 'Backspace', code: 8 },
];

const KEY_BTN = `h-7 px-2 rounded-sm border border-hairline bg-surface-2 text-[11px] font-mono text-text-secondary hover:text-text-primary hover:bg-surface-3 ${FOCUS}`;

const Segmented = <V extends string | number>({ label, value, options, onChange }: {
  label: string; value: V; options: { id: V; label: string }[]; onChange: (v: V) => void;
}) => (
  <div role="group" aria-label={label} className="flex items-center p-0.5 rounded-sm border border-hairline bg-surface-1">
    {options.map(o => (
      <button
        key={o.id}
        type="button"
        aria-pressed={value === o.id}
        onClick={() => onChange(o.id)}
        className={`h-6 px-2 rounded-xs text-[11px] font-medium ${FOCUS} ${value === o.id ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const RemoteVncModal: React.FC<RemoteVncModalProps> = ({
  isOpen,
  pc,
  onClose,
  onOpenChat,
  onOpenTaskManager,
  onLockWorkstation,
  onUnlockWorkstation,
  onRestartWorkstation,
  onShutdownWorkstation
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [autoStream, setAutoStream] = useState(true);
  const [streamIntervalMs, setStreamIntervalMs] = useState(300);
  const [isControlEnabled, setIsControlEnabled] = useState(true);
  const [scalingMode, setScalingMode] = useState<Scaling>('fit');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastCaptureTime, setLastCaptureTime] = useState<Date | null>(null);
  const [liveFps, setLiveFps] = useState(0);
  const [quickText, setQuickText] = useState('');
  const [confirm, setConfirm] = useState<'restart' | 'shutdown' | null>(null);

  const frameCountRef = useRef(0);
  const lastFpsCheckRef = useRef(Date.now());
  const lastMoveTimeRef = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const requestCapture = useCallback(async () => {
    if (!pc) return;
    const sent = await (window as any).electronAPI?.sendToClient?.(pc.name, OpCode.REMOTE_COMMAND, {
      action: 'capture_screen',
      params: { requestId: String(Date.now()), pcId: pc.name }
    });
    if (sent === false) {
      setCaptureError(`${pc.name} tidak terhubung ke server.`);
    }
  }, [pc]);

  useEffect(() => {
    if (!isOpen || !pc) return;
    setImageSrc(null);
    setCaptureError(null);
    setLiveFps(0);
    frameCountRef.current = 0;
    lastFpsCheckRef.current = Date.now();
    requestCapture();
  }, [isOpen, pc, requestCapture]);

  useEffect(() => {
    if (!isOpen || !pc || !autoStream) return;
    const timer = setInterval(requestCapture, streamIntervalMs);
    return () => clearInterval(timer);
  }, [isOpen, pc, autoStream, streamIntervalMs, requestCapture]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!isOpen || !pc || !api?.onScreenCaptureUpdated) return;
    const unsub = api.onScreenCaptureUpdated((data: ScreenCaptureUpdate) => {
      if (!isCaptureFor(pc, data)) return;
      if (!data.imageBase64) {
        setCaptureError(data.error || 'PC gagal mengambil layar.');
        return;
      }
      setCaptureError(null);
      setImageSrc(data.imageBase64);
      setLastCaptureTime(new Date(data.timestamp || Date.now()));
      frameCountRef.current += 1;
      const now = Date.now();
      if (now - lastFpsCheckRef.current >= 1000) {
        setLiveFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsCheckRef.current = now;
      }
    });
    return () => unsub?.();
  }, [isOpen, pc]);

  // Esc closes the viewer, except while the remote screen has focus: there it belongs to the remote PC.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || confirm || document.activeElement === viewportRef.current) return;
      if (isFullscreen) setIsFullscreen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, confirm, isFullscreen, onClose]);

  const sendRemoteInput = useCallback((action: string, params: any) => {
    if (!pc || !isControlEnabled) return;
    (window as any).electronAPI?.sendToClient?.(pc.name, OpCode.REMOTE_COMMAND, { action, params });
  }, [pc, isControlEnabled]);

  const getRemoteCoordinates = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const naturalW = imgRef.current.naturalWidth || 1920;
    const naturalH = imgRef.current.naturalHeight || 1080;
    const x = Math.max(0, Math.min(naturalW, Math.round(((e.clientX - rect.left) / rect.width) * naturalW)));
    const y = Math.max(0, Math.min(naturalH, Math.round(((e.clientY - rect.top) / rect.height) * naturalH)));
    return { x, y };
  };

  const mouseButton = (e: React.MouseEvent) => (e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left');

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const coords = getRemoteCoordinates(e);
    const now = Date.now();
    if (!coords || now - lastMoveTimeRef.current <= 20) return; // ~50 Hz pointer rate
    lastMoveTimeRef.current = now;
    sendRemoteInput('remote_mouse_move', coords);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    viewportRef.current?.focus();
    const coords = getRemoteCoordinates(e);
    if (!coords) return;
    sendRemoteInput('remote_mouse_move', coords);
    sendRemoteInput('remote_mouse_click', { type: 'down', button: mouseButton(e), ...coords });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLImageElement>) => {
    const coords = getRemoteCoordinates(e);
    if (!coords) return;
    sendRemoteInput('remote_mouse_click', { type: 'up', button: mouseButton(e), ...coords });
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const coords = getRemoteCoordinates(e);
    if (!coords) return;
    sendRemoteInput('remote_mouse_click', { type: 'click', doubleClick: true, button: 'left', ...coords });
  };

  const handleKey = (type: 'down' | 'up') => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isControlEnabled) return;
    e.preventDefault();
    sendRemoteInput('remote_key_event', { type, keyCode: e.keyCode, key: e.key });
  };

  const sendShortcutKey = (keyCode: number) => {
    sendRemoteInput('remote_key_event', { type: 'down', keyCode });
    setTimeout(() => sendRemoteInput('remote_key_event', { type: 'up', keyCode }), 40);
  };

  const handleSendQuickText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickText.trim()) return;
    sendRemoteInput('remote_text_input', { text: quickText });
    setQuickText('');
  };

  const handleSaveSnapshot = () => {
    if (!imageSrc || !pc) return;
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = `gc-hub-${pc.name}-${Date.now()}.jpg`;
    link.click();
  };

  if (!isOpen || !pc) return null;

  const isActive = pc.state === 'active_guest' || pc.state === 'active_member';
  const isLocked = pc.state === 'locked';

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 ${isFullscreen ? '' : 'p-3'}`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Remote ${pc.name}`}
        className={`w-full h-full flex flex-col bg-surface-2 overflow-hidden ${isFullscreen ? '' : 'border border-hairline rounded-md shadow-modal'}`}
      >
        <header className="flex-none flex flex-wrap items-center gap-2 px-3 min-h-12 py-2 border-b border-hairline">
          <h2 className="text-[15px] font-semibold text-text-primary">{pc.name}</h2>
          <span className="text-[12px] font-mono text-text-muted">{pc.ip || 'IP belum diketahui'}</span>
          {pc.username && <span className="text-[12px] text-text-secondary">{pc.username}</span>}
          <div className="flex-1" />
          <span className="text-[12px] font-mono tabular text-text-muted w-14 text-right" aria-live="off">
            {autoStream ? `${liveFps} FPS` : 'Dijeda'}
          </span>
          <button
            type="button"
            onClick={() => setIsControlEnabled(v => !v)}
            aria-pressed={isControlEnabled}
            className={cn(BTN_GHOST, `border ${isControlEnabled ? 'border-primary/40 bg-primary/10 text-primary' : 'border-hairline text-text-secondary hover:text-text-primary'}`)}
          >
            {isControlEnabled ? <MousePointer className="w-3.5 h-3.5" aria-hidden /> : <Eye className="w-3.5 h-3.5" aria-hidden />}
            {isControlEnabled ? 'Kendali aktif' : 'Hanya pantau'}
          </button>
          <button
            type="button"
            onClick={() => setAutoStream(v => !v)}
            aria-pressed={autoStream}
            className={cn(BTN_GHOST, 'border border-hairline text-text-secondary hover:text-text-primary')}
          >
            {autoStream ? 'Jeda' : 'Lanjut'}
          </button>
          <Segmented label="Kecepatan stream" value={streamIntervalMs} options={STREAM_PRESETS.map(p => ({ id: p.ms, label: p.label }))} onChange={setStreamIntervalMs} />
          <Segmented label="Skala layar" value={scalingMode} options={SCALING} onChange={setScalingMode} />
          <button
            type="button"
            onClick={() => setIsFullscreen(v => !v)}
            aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
            className={`w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3 ${FOCUS}`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" aria-hidden /> : <Maximize2 className="w-4 h-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className={`w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3 ${FOCUS}`}
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>

        <div className="flex-none flex flex-wrap items-center gap-2 px-3 py-2 border-b border-hairline bg-surface-1">
          <div role="group" aria-label="Kirim tombol" className="flex flex-wrap items-center gap-1">
            {COMBOS.map(c => (
              <button
                key={c.label}
                type="button"
                disabled={!isControlEnabled}
                onClick={() => sendRemoteInput('remote_key_combo', { keyCodes: c.keys })}
                className={`${KEY_BTN} disabled:opacity-40 ${c.danger ? 'text-error' : ''}`}
              >
                {c.label}
              </button>
            ))}
            <span className="w-px h-5 bg-hairline mx-1" aria-hidden />
            {SINGLE_KEYS.map(k => (
              <button key={k.label} type="button" disabled={!isControlEnabled} onClick={() => sendShortcutKey(k.code)} className={`${KEY_BTN} disabled:opacity-40`}>
                {k.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSendQuickText} className="flex items-center gap-1 flex-1 min-w-[200px] max-w-sm">
            <input
              type="text"
              value={quickText}
              onChange={e => setQuickText(e.target.value)}
              disabled={!isControlEnabled}
              placeholder="Ketik teks ke PC"
              aria-label="Teks untuk diketik di PC"
              className={cn(INPUT, 'h-7 text-[12px]')}
            />
            <button
              type="submit"
              disabled={!isControlEnabled || !quickText.trim()}
              aria-label="Kirim teks"
              className={`h-7 w-8 flex-none flex items-center justify-center rounded-sm bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-40 ${FOCUS}`}
            >
              <Send className="w-3.5 h-3.5" aria-hidden />
            </button>
          </form>

          <div className="flex-1" />

          <div className="flex flex-wrap items-center gap-1">
            {isActive && onLockWorkstation && (
              <button type="button" onClick={() => onLockWorkstation(pc)} className={cn(BTN_GHOST, 'text-warning hover:bg-warning/10')}>
                <Lock className="w-3.5 h-3.5" aria-hidden /> Kunci
              </button>
            )}
            {isLocked && onUnlockWorkstation && (
              <button type="button" onClick={() => onUnlockWorkstation(pc)} className={cn(BTN_GHOST, 'text-primary hover:bg-primary/10')}>
                <Unlock className="w-3.5 h-3.5" aria-hidden /> Buka kunci
              </button>
            )}
            {onOpenChat && (
              <button type="button" onClick={() => onOpenChat(pc)} className={cn(BTN_GHOST, 'text-text-secondary hover:text-text-primary hover:bg-surface-3')}>
                <MessageSquare className="w-3.5 h-3.5" aria-hidden /> Chat
              </button>
            )}
            {onOpenTaskManager && (
              <button type="button" onClick={() => onOpenTaskManager(pc)} className={cn(BTN_GHOST, 'text-text-secondary hover:text-text-primary hover:bg-surface-3')}>
                <Activity className="w-3.5 h-3.5" aria-hidden /> Proses
              </button>
            )}
            <button type="button" onClick={handleSaveSnapshot} disabled={!imageSrc} className={cn(BTN_GHOST, 'text-text-secondary hover:text-text-primary hover:bg-surface-3 disabled:opacity-40')}>
              <Camera className="w-3.5 h-3.5" aria-hidden /> Simpan gambar
            </button>
            <span className="w-px h-5 bg-hairline mx-1" aria-hidden />
            {onRestartWorkstation && (
              <button type="button" onClick={() => setConfirm('restart')} className={cn(BTN_GHOST, 'text-warning hover:bg-warning/10')}>
                <RotateCcw className="w-3.5 h-3.5" aria-hidden /> Restart
              </button>
            )}
            {onShutdownWorkstation && (
              <button type="button" onClick={() => setConfirm('shutdown')} className={cn(BTN_GHOST, 'text-error hover:bg-error/10')}>
                <Power className="w-3.5 h-3.5" aria-hidden /> Matikan
              </button>
            )}
          </div>
        </div>

        <div
          ref={viewportRef}
          tabIndex={0}
          aria-label={isControlEnabled ? `Layar ${pc.name}. Klik untuk mengendalikan, tombol keyboard dikirim ke PC.` : `Layar ${pc.name}`}
          onKeyDown={handleKey('down')}
          onKeyUp={handleKey('up')}
          onWheel={e => sendRemoteInput('remote_mouse_scroll', { deltaY: e.deltaY })}
          className="relative flex-1 min-h-0 flex items-center justify-center overflow-auto bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          {imageSrc ? (
            <img
              ref={imgRef}
              src={imageSrc}
              alt={`Layar ${pc.name}`}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onDoubleClick={handleDoubleClick}
              onContextMenu={e => e.preventDefault()}
              draggable={false}
              className={`select-none ${
                scalingMode === 'fit' ? 'w-full h-full object-contain' : scalingMode === 'fill' ? 'w-full h-full object-fill' : 'max-w-none'
              } ${isControlEnabled ? 'cursor-crosshair' : 'cursor-default'}`}
            />
          ) : captureError ? (
            <div className="text-center p-8">
              <p className="text-[13px] font-medium text-text-primary">{captureError}</p>
              <button type="button" onClick={requestCapture} className={cn(BTN_GHOST, 'mt-3 border border-hairline text-text-secondary hover:text-text-primary')}>
                <RefreshCw className="w-3.5 h-3.5" aria-hidden /> Coba lagi
              </button>
            </div>
          ) : (
            <div className="text-center p-8">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin text-text-muted" aria-hidden />
              <p className="mt-3 text-[13px] text-text-secondary">Menunggu layar dari {pc.name}</p>
            </div>
          )}
          {imageSrc && captureError && (
            <div role="status" className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-sm bg-surface-2 border border-error/40 text-[12px] text-error">
              {captureError} Gambar ini frame terakhir.
            </div>
          )}
        </div>

        <footer className="flex-none flex items-center justify-between gap-3 px-3 h-8 border-t border-hairline text-[11px] text-text-muted">
          <span>
            {isControlEnabled ? 'Klik layar untuk mengendalikan. Keyboard dikirim ke PC selama layar terpilih.' : 'Mode pantau. Input tidak dikirim.'}
          </span>
          {lastCaptureTime && <span className="font-mono tabular">Frame {lastCaptureTime.toLocaleTimeString('id-ID')}</span>}
        </footer>
      </div>

      <ConfirmModal
        isOpen={confirm === 'restart'}
        title="Restart PC?"
        description={`${pc.name} akan di-restart sekarang.`}
        detail="Aplikasi yang sedang jalan di PC itu akan ditutup."
        iconType="warning"
        confirmText="Restart"
        confirmVariant="warning"
        onConfirm={() => onRestartWorkstation?.(pc)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmModal
        isOpen={confirm === 'shutdown'}
        title="Matikan PC?"
        description={`${pc.name} akan dimatikan total.`}
        confirmText="Matikan"
        onConfirm={() => onShutdownWorkstation?.(pc)}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
};
