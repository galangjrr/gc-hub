import React, { useState, useEffect, useCallback } from 'react';
import { Workstation } from '../../../shared/types';
import { RefreshCw, Save } from 'lucide-react';
import { OpCode } from '../../../shared/protocol';
import { Modal, BTN_PRIMARY, BTN_SECONDARY, FOCUS } from '../../../shared/ui/primitives';

interface ScreenshotViewerModalProps {
  isOpen: boolean;
  pc: Workstation | null;
  onClose: () => void;
}

export interface ScreenCaptureUpdate {
  pcId?: string;
  pcName?: string;
  imageBase64?: string | null;
  error?: string;
  timestamp?: number;
}

// Same matching rule the server uses to route commands to a client (pcId or pcName, case-insensitive).
export const isCaptureFor = (pc: Workstation, data: ScreenCaptureUpdate) => {
  const target = pc.name.toUpperCase();
  return data.pcId?.toUpperCase() === target || data.pcName?.toUpperCase() === target;
};

type Zoom = 'fit' | '100' | '125';
const ZOOMS: { id: Zoom; label: string }[] = [
  { id: 'fit', label: 'Pas' },
  { id: '100', label: '100%' },
  { id: '125', label: '125%' },
];

export const ScreenshotViewerModal: React.FC<ScreenshotViewerModalProps> = ({ isOpen, pc, onClose }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastCaptureTime, setLastCaptureTime] = useState<Date | null>(null);
  const [zoom, setZoom] = useState<Zoom>('fit');

  const requestCapture = useCallback(async () => {
    if (!pc) return;
    setIsLoading(true);
    const sent = await (window as any).electronAPI?.sendToClient?.(pc.name, OpCode.REMOTE_COMMAND, {
      action: 'capture_screen',
      params: { requestId: String(Date.now()), pcId: pc.name }
    });
    if (sent === false) {
      setIsLoading(false);
      setCaptureError(`${pc.name} tidak terhubung ke server.`);
    }
  }, [pc]);

  useEffect(() => {
    if (!isOpen || !pc) return;
    setImageSrc(null);
    setCaptureError(null);
    requestCapture();
  }, [isOpen, pc, requestCapture]);

  useEffect(() => {
    if (!isOpen || !pc || !autoRefresh) return;
    const interval = setInterval(requestCapture, 3000);
    return () => clearInterval(interval);
  }, [isOpen, pc, autoRefresh, requestCapture]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!isOpen || !pc || !api?.onScreenCaptureUpdated) return;
    const unsub = api.onScreenCaptureUpdated((data: ScreenCaptureUpdate) => {
      if (!isCaptureFor(pc, data)) return;
      setIsLoading(false);
      if (!data.imageBase64) {
        setCaptureError(data.error || 'PC gagal mengambil layar.');
        return;
      }
      setCaptureError(null);
      setImageSrc(data.imageBase64);
      setLastCaptureTime(new Date(data.timestamp || Date.now()));
    });
    return () => unsub?.();
  }, [isOpen, pc]);

  if (!isOpen || !pc) return null;

  const handleSaveImage = () => {
    if (!imageSrc) return;
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = `gc-hub-${pc.name}-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    link.click();
  };

  return (
    <Modal title={`Layar ${pc.name}`} onClose={onClose} width={1024}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-hairline text-[12px] text-text-muted">
        <span>{pc.username || 'Tanpa pengguna'}</span>
        {lastCaptureTime && <span className="font-mono tabular">Diambil {lastCaptureTime.toLocaleTimeString('id-ID')}</span>}
        <div className="flex-1" />
        <label className="inline-flex items-center gap-2 text-text-secondary cursor-pointer">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="w-4 h-4 accent-primary cursor-pointer" />
          Ambil ulang tiap 3 detik
        </label>
        <div role="group" aria-label="Zoom" className="flex items-center p-0.5 rounded-sm border border-hairline bg-surface-1">
          {ZOOMS.map(z => (
            <button
              key={z.id}
              type="button"
              aria-pressed={zoom === z.id}
              onClick={() => setZoom(z.id)}
              className={`h-6 px-2 rounded-xs text-[11px] font-medium ${FOCUS} ${zoom === z.id ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative bg-canvas flex items-center justify-center overflow-auto h-[60vh]">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={`Tangkapan layar ${pc.name}`}
            className={zoom === 'fit' ? 'w-full h-full object-contain' : zoom === '100' ? 'max-w-none w-[1280px]' : 'max-w-none w-[1600px]'}
          />
        ) : captureError ? (
          <p className="p-8 text-center text-[13px] font-medium text-text-primary">{captureError}</p>
        ) : (
          <div className="text-center p-8">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin text-text-muted" aria-hidden />
            <p className="mt-3 text-[13px] text-text-secondary">Menunggu layar dari {pc.name}</p>
          </div>
        )}
        {imageSrc && captureError && (
          <div role="status" className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-sm bg-surface-2 border border-error/40 text-[12px] text-error">
            {captureError} Gambar ini tangkapan terakhir.
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-hairline">
        <button type="button" onClick={requestCapture} disabled={isLoading} className={BTN_SECONDARY}>
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden />
          {isLoading ? 'Mengambil' : 'Ambil ulang'}
        </button>
        <button type="button" onClick={handleSaveImage} disabled={!imageSrc} className={BTN_PRIMARY}>
          <Save className="w-3.5 h-3.5" aria-hidden />
          Simpan gambar
        </button>
      </div>
    </Modal>
  );
};
