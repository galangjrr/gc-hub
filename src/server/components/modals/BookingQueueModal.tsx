import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Play, ArrowLeftRight, RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { Workstation } from '../../../shared/types';
import { Modal, INPUT, BTN_PRIMARY, BTN_SECONDARY, BTN_GHOST, FOCUS, ErrorLine } from '../../../shared/ui/primitives';
import { rupiah } from '../PcCard';
import { cn } from '../../../shared/ui/utils';

// Bentuk data dari IPC supabase:list-bookings (lihat src/main/index.ts)
export interface QueueBooking {
  id: string;
  pc_id: string | null;
  paket_id: string;
  player_name: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  booking_type: 'queue' | 'slot';
  scheduled_at?: string | null;
  payment_status: 'paid' | 'unpaid';
  source?: string;
  paket: { id: string; name: string; price: number; duration_minutes: number | null } | null;
  localPcName: string | null;
  runningOnPc: string | null;
}

interface CloudStatus {
  configured: boolean;
  online: boolean;
  pendingOutbox: number;
  deadOutbox: number;
  lastError: string | null;
}

interface ListResult {
  bookings: QueueBooking[];
  fromCache: boolean;
  error: string | null;
  status: CloudStatus;
}

interface BookingQueueModalProps {
  isOpen: boolean;
  workstations: Workstation[];
  onClose: () => void;
  onChanged: (pendingCount: number) => void;
}

const BUSY_STATES = new Set(['in_use', 'active_member', 'active_guest', 'locked', 'suspended', 'unpaid']);
const NO_STATUS: CloudStatus = { configured: false, online: false, pendingOutbox: 0, deadOutbox: 0, lastError: null };

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');

const Chip: React.FC<{ tone: 'success' | 'warning' | 'error' | 'info' | 'muted'; children: React.ReactNode }> = ({ tone, children }) => {
  const tones = {
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    error: 'bg-error/15 text-error',
    info: 'bg-info/15 text-info',
    muted: 'bg-surface-carbon text-text-secondary',
  };
  return <span className={`inline-flex items-center h-5 px-1.5 rounded-xs text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
};

export const BookingQueueModal: React.FC<BookingQueueModalProps> = ({ isOpen, workstations, onClose, onChanged }) => {
  const [data, setData] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetPc, setTargetPc] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const api = (window as any).electronAPI;

  const load = useCallback(async () => {
    if (!api?.listBookings) {
      setData({ bookings: [], fromCache: true, error: 'Fitur booking hanya tersedia di aplikasi server.', status: NO_STATUS });
      return;
    }
    setLoading(true);
    try {
      const result: ListResult = await api.listBookings();
      setData(result);
      onChanged(result.bookings.filter(b => b.status === 'pending').length);
    } catch (err: any) {
      setData(prev => ({ bookings: prev?.bookings || [], fromCache: true, error: err?.message || 'Gagal memuat booking.', status: prev?.status || { ...NO_STATUS, configured: true } }));
    } finally {
      setLoading(false);
    }
  }, [api, onChanged]);

  useEffect(() => {
    if (!isOpen) return;
    setRowMessage({});
    setRejectingId(null);
    load();
    return api?.onBookingsChanged?.(() => load());
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const idlePcs = workstations.filter(w => !BUSY_STATES.has(w.state));
  const defaultPcFor = (b: QueueBooking) => (b.localPcName && idlePcs.some(w => w.name === b.localPcName) ? b.localPcName : idlePcs[0]?.name || '');
  const pcFor = (b: QueueBooking) => targetPc[b.id] ?? defaultPcFor(b);

  const runAction = async (b: QueueBooking, action: () => Promise<{ success: boolean; message: string }>) => {
    setBusyId(b.id);
    try {
      const res = await action();
      setRowMessage(prev => ({ ...prev, [b.id]: { ok: res.success, text: res.message } }));
      if (res.success) await load();
    } catch (err: any) {
      setRowMessage(prev => ({ ...prev, [b.id]: { ok: false, text: err?.message || 'Aksi gagal.' } }));
    } finally {
      setBusyId(null);
    }
  };

  const status = data?.status;
  const bookings = data?.bookings || [];
  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  return (
    <Modal title="Booking online" onClose={onClose} width={720}>
      <div className="flex items-center gap-3 px-4 h-11 border-b border-hairline text-[12px]">
        {status && (status.online
          ? <span className="inline-flex items-center gap-1.5 text-success"><Cloud className="w-3.5 h-3.5" aria-hidden />Cloud terhubung</span>
          : <span className="inline-flex items-center gap-1.5 text-warning"><CloudOff className="w-3.5 h-3.5" aria-hidden />{status.configured ? 'Cloud terputus' : 'Cloud belum diatur'}</span>)}
        {data && <span className="text-text-muted"><b className="font-mono tabular font-medium text-text-primary">{pendingCount}</b> menunggu</span>}
        <button type="button" onClick={load} disabled={loading} className={cn(BTN_GHOST, 'ml-auto text-text-secondary hover:text-text-primary hover:bg-surface-3 disabled:opacity-50')}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden />
          Muat ulang
        </button>
      </div>

      <div className="p-4 space-y-3" aria-busy={loading}>
        {data?.error && (
          status?.configured
            ? <ErrorLine message={`Cloud tidak bisa dihubungi: ${data.error}.${bookings.length ? ' Menampilkan data terakhir.' : ''}`} onRetry={load} />
            : <p role="status" className="px-3 py-2 rounded-sm border border-warning/40 bg-warning/10 text-[13px] text-text-primary">
                {api?.listBookings ? 'Kredensial cloud belum diisi. Buka Pengaturan, tab Cloud, untuk menghubungkan GC Net Booking.' : data.error}
              </p>
        )}
        {status && status.pendingOutbox > 0 && (
          <p role="status" className="text-[12px] text-text-muted">{status.pendingOutbox} perubahan menunggu dikirim ke cloud. Billing tetap jalan normal.</p>
        )}
        {status && status.deadOutbox > 0 && (
          <p role="alert" className="text-[12px] text-error">{status.deadOutbox} perubahan ditolak cloud dan tidak dikirim ulang. Cek Log server.</p>
        )}

        {!data && (
          <div className="space-y-2" aria-label="Memuat booking">
            {[0, 1, 2].map(i => <div key={i} className="h-[92px] rounded-md bg-surface-3 motion-safe:animate-pulse" />)}
          </div>
        )}

        {data && bookings.length === 0 && !data.error && (
          <div className="py-10 flex flex-col items-center text-center gap-1.5">
            <CalendarClock className="w-7 h-7 text-text-disabled" aria-hidden />
            <p className="text-[14px] font-medium text-text-secondary">Belum ada booking masuk</p>
            <p className="text-[12px] text-text-muted max-w-sm">Booking dari GC Net Booking atau aplikasi lain lewat API muncul di sini, disertai bunyi notifikasi.</p>
          </div>
        )}

        {bookings.map(b => {
          const isBusy = busyId === b.id;
          const msg = rowMessage[b.id];
          const canStart = !b.runningOnPc && (b.status === 'pending' || b.status === 'active');
          const selected = pcFor(b);
          const paid = b.payment_status === 'paid';
          const price = b.paket?.price ?? 0;
          const place = b.runningOnPc
            ? `Main di ${b.runningOnPc}`
            : b.booking_type === 'slot'
              ? `Datang ${when(b.scheduled_at)}, ${b.localPcName ? `minta ${b.localPcName}` : 'PC bebas'}`
              : `Antre di ${b.localPcName || b.pc_id || '-'}`;

          return (
            <article key={b.id} aria-labelledby={`bk-${b.id}`} className="rounded-md border border-hairline bg-surface-1">
              <div className="flex items-start justify-between gap-4 px-3.5 pt-3 pb-2.5">
                <div className="min-w-0">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <h3 id={`bk-${b.id}`} className="text-[14px] font-semibold text-text-primary truncate">{b.player_name}</h3>
                    {b.status === 'pending' ? <Chip tone="warning">Menunggu</Chip> : <Chip tone="success">Aktif</Chip>}
                    <Chip tone="muted">{b.booking_type === 'slot' ? 'Booking jam' : 'Antre PC'}</Chip>
                  </div>
                  <p className="mt-1 text-[12px] text-text-secondary">{place}</p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Masuk {when(b.created_at)}{b.source && b.source !== 'web' ? `, ${b.source.replace(/^api:/, 'via ')}` : ''}
                  </p>
                </div>
                <div className="flex-none text-right">
                  <div className="text-[12px] text-text-secondary">
                    {b.paket ? `${b.paket.name}, ${b.paket.duration_minutes || 60} menit` : `Paket ${b.paket_id}`}
                  </div>
                  <div className="mt-0.5 flex items-center justify-end gap-1.5">
                    <span className="font-mono tabular text-[15px] font-semibold text-text-primary">{rupiah(price)}</span>
                    {paid ? <Chip tone="info">Lunas online</Chip> : <Chip tone="warning">Belum bayar</Chip>}
                  </div>
                </div>
              </div>

              {canStart && rejectingId !== b.id && (
                <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-t border-hairline">
                  <label htmlFor={`pc-${b.id}`} className="text-[12px] font-medium text-text-secondary">PC</label>
                  <select
                    id={`pc-${b.id}`}
                    value={selected}
                    onChange={e => setTargetPc(prev => ({ ...prev, [b.id]: e.target.value }))}
                    className={cn(INPUT, 'w-[160px]')}
                  >
                    {idlePcs.length === 0 && <option value="">Semua PC dipakai</option>}
                    {idlePcs.map(w => (
                      <option key={w.name} value={w.name}>{w.name}{w.state === 'offline' ? ', client mati' : ''}</option>
                    ))}
                  </select>

                  <button type="button" disabled={isBusy || !selected} onClick={() => runAction(b, () => api.startBooking(b.id, selected))} className={BTN_PRIMARY}>
                    <Play className="w-3.5 h-3.5" aria-hidden />
                    {paid || price <= 0 ? 'Mulai sesi' : `Terima ${rupiah(price)}, mulai`}
                  </button>

                  {b.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy || !selected || selected === b.localPcName}
                        onClick={() => runAction(b, () => api.reassignBooking(b.id, selected))}
                        className={BTN_SECONDARY}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden />
                        Alihkan
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => { setRejectingId(b.id); setRejectReason(''); }}
                        className={cn(BTN_GHOST, 'ml-auto text-error hover:bg-error/10 disabled:opacity-50')}
                      >
                        Tolak
                      </button>
                    </>
                  )}
                  {paid && price > 0 && <p className="basis-full text-[11px] text-text-muted">Sudah lunas online. Tercatat di laporan sebagai transfer, tidak dihitung uang laci.</p>}
                </div>
              )}

              {rejectingId === b.id && (
                <form
                  className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-t border-hairline"
                  onSubmit={e => {
                    e.preventDefault();
                    setRejectingId(null);
                    runAction(b, () => api.rejectBooking(b.id, rejectReason));
                  }}
                >
                  <label htmlFor={`reason-${b.id}`} className="sr-only">Alasan tolak</label>
                  <input
                    id={`reason-${b.id}`}
                    autoFocus
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    maxLength={200}
                    placeholder="Alasan, misal PC dipakai walk-in, silakan booking ulang"
                    className={cn(INPUT, 'flex-1 min-w-[240px]')}
                  />
                  <button type="button" onClick={() => setRejectingId(null)} className={BTN_SECONDARY}>Batal</button>
                  <button type="submit" className={`inline-flex items-center h-9 px-4 rounded-sm bg-error text-white text-[13px] font-semibold hover:opacity-90 ${FOCUS}`}>
                    Tolak booking
                  </button>
                </form>
              )}

              {msg && (
                <p role="status" className={`px-3.5 pb-2.5 text-[12px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</p>
              )}
            </article>
          );
        })}
      </div>
    </Modal>
  );
};
