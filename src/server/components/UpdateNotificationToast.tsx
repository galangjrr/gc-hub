import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { BTN_PRIMARY, BTN_SECONDARY, FOCUS } from '../../shared/ui/primitives';
import { cn } from '../../shared/ui/utils';

type Status = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

interface UpdateState {
  status: Status;
  version?: string;
  percent: number;
  errorMessage?: string;
  dismissed: boolean;
}

// Left stripe per status, like the widget toasts in DESIGN.md section 6
const STRIPE: Record<Exclude<Status, 'idle'>, string> = {
  available: 'border-l-info',
  downloading: 'border-l-info',
  downloaded: 'border-l-primary',
  error: 'border-l-error',
};

export const UpdateNotificationToast: React.FC = () => {
  const [state, setState] = useState<UpdateState>({ status: 'idle', percent: 0, dismissed: false });
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onUpdateStatusChanged) return;
    return api.onUpdateStatusChanged((payload: any) => {
      if (!payload) return;
      if (payload.status === 'available') {
        setState({ status: 'available', version: payload.info?.version, percent: 0, dismissed: false });
      } else if (payload.status === 'downloading') {
        setState(prev => ({ ...prev, status: 'downloading', percent: Math.min(100, Math.max(0, Math.round(payload.progress?.percent ?? 0))) }));
      } else if (payload.status === 'downloaded') {
        setState({ status: 'downloaded', version: payload.info?.version, percent: 100, dismissed: false });
      } else if (payload.status === 'error') {
        // A failed background check is not news; only a download the cashier was told about is.
        setState(prev => (prev.status === 'available' || prev.status === 'downloading')
          ? { ...prev, status: 'error', errorMessage: String(payload.error || ''), dismissed: false }
          : prev);
      }
    });
  }, []);

  if (state.dismissed || state.status === 'idle') return null;

  const dismiss = () => setState(prev => ({ ...prev, dismissed: true }));
  const install = async () => {
    setInstalling(true);
    const ok = await (window as any).electronAPI?.quitAndInstallUpdate?.();
    if (!ok) {
      setInstalling(false);
      setState(prev => ({ ...prev, status: 'error', errorMessage: 'Pemasang update gagal dijalankan.' }));
    }
  };

  const title = {
    available: 'Update ditemukan',
    downloading: 'Mengunduh update',
    downloaded: 'Update siap dipasang',
    error: 'Update gagal',
  }[state.status];
  const body = {
    available: `Versi ${state.version || 'baru'} sedang diunduh di latar belakang.`,
    downloading: `${state.percent}% selesai. Kasir tetap bisa dipakai.`,
    downloaded: `Versi ${state.version || 'baru'} siap. Server tertutup sebentar saat dipasang, sesi di PC tetap jalan dan tersambung lagi setelah server buka.`,
    error: state.errorMessage || 'Server update tidak bisa dihubungi. Dicoba lagi saat aplikasi dibuka berikutnya.',
  }[state.status];

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Update aplikasi"
      className={`fixed bottom-4 right-4 z-[90] w-[340px] max-w-[calc(100vw-32px)] bg-surface-2 border border-hairline border-l-4 ${STRIPE[state.status]} rounded-md shadow-modal p-3`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold text-text-primary">{title}</h2>
          <p className="mt-0.5 text-[12px] text-text-secondary break-words">{body}</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Tutup notifikasi update" className={`flex-none w-7 h-7 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3 ${FOCUS}`}>
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>

      {state.status === 'downloading' && (
        <div className="mt-2.5 h-1.5 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={state.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progres unduhan">
          <div className="h-full bg-info transition-[width] duration-300" style={{ width: `${state.percent}%` }} />
        </div>
      )}

      {state.status === 'downloaded' && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={install} disabled={installing} className={cn(BTN_PRIMARY, 'h-8 flex-1')}>
            <RefreshCw className={`w-3.5 h-3.5 ${installing ? 'motion-safe:animate-spin' : ''}`} aria-hidden />
            {installing ? 'Memasang' : 'Pasang sekarang'}
          </button>
          <button type="button" onClick={dismiss} className={cn(BTN_SECONDARY, 'h-8')}>Nanti</button>
        </div>
      )}
    </aside>
  );
};
