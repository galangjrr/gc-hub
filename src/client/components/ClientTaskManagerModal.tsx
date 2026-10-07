import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Search, Gamepad2, Globe, AppWindow, Trash2 } from 'lucide-react';
import { RemoteProcessItem } from '../../shared/protocol';
import { ProcessWatcherGuard } from '../security/processGuard';
import { Modal, BTN_SECONDARY, BTN_GHOST, FOCUS, INPUT, TH, TD, SkeletonRows, ErrorLine } from '../../shared/ui/primitives';
import { ConfirmModal } from '../../shared/ui/ConfirmModal';
import { cn } from '../../shared/ui/utils';

interface ClientTaskManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Category = RemoteProcessItem['category'];

// The user scan drops system and billing processes, so only these reach the list
const CATEGORIES: { id: Category; label: string; Icon: React.FC<{ className?: string }>; tone: string }[] = [
  { id: 'game', label: 'Game', Icon: Gamepad2, tone: 'text-success' },
  { id: 'browser', label: 'Browser', Icon: Globe, tone: 'text-info' },
  { id: 'app', label: 'Aplikasi', Icon: AppWindow, tone: 'text-primary' },
  { id: 'other', label: 'Lainnya', Icon: AppWindow, tone: 'text-text-muted' },
];
const CATEGORY_BY_ID: Record<string, (typeof CATEGORIES)[number]> = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

export const ClientTaskManagerModal: React.FC<ClientTaskManagerModalProps> = ({ isOpen, onClose }) => {
  const [processes, setProcesses] = useState<RemoteProcessItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [confirmItem, setConfirmItem] = useState<RemoteProcessItem | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const fetchProcesses = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setProcesses(await ProcessWatcherGuard.getRunningUserProcesses(false));
    } catch (err: any) {
      setLoadError(err?.message || 'Daftar aplikasi gagal dibaca.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setFeedback(null);
    setProcesses(null);
    fetchProcesses();
  }, [isOpen, fetchProcesses]);

  const list = processes || [];
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of list) map[p.category] = (map[p.category] || 0) + 1;
    return map;
  }, [list]);

  // Hung programs first: that is what a player opens this for
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return list
      .filter(p => (category === 'all' || p.category === category) && (!q || p.name.toLowerCase().includes(q) || (p.windowTitle || '').toLowerCase().includes(q)))
      .sort((a, b) => Number(b.status === 'not_responding') - Number(a.status === 'not_responding'));
  }, [list, category, searchQuery]);

  const handleKill = async (item: RemoteProcessItem) => {
    setConfirmItem(null);
    setKillingPid(item.pid);
    const result = await ProcessWatcherGuard.killRemoteProcess(item.pid, item.name, true);
    setFeedback({ ok: result.success, text: result.success ? `${item.windowTitle || item.name} sudah ditutup.` : result.message });
    setKillingPid(null);
    if (result.success) await fetchProcesses();
  };

  if (!isOpen) return null;

  const tab = (id: Category | 'all', label: string, count: number, Icon?: React.FC<{ className?: string }>) => (
    <button
      key={id}
      type="button"
      onClick={() => setCategory(id)}
      aria-pressed={category === id}
      className={cn(BTN_GHOST, `${category === id ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary'}`)}
    >
      {Icon && <Icon className="w-3.5 h-3.5" aria-hidden />}
      <span>{label}</span>
      <span className="font-mono tabular text-text-muted">{count}</span>
    </button>
  );

  return (
    <Modal title="Tutup program macet" onClose={confirmItem ? () => setConfirmItem(null) : onClose} width={760}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-hairline">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter kategori">
          {tab('all', 'Semua', list.length)}
          {CATEGORIES.filter(c => counts[c.id]).map(c => tab(c.id, c.label, counts[c.id], c.Icon))}
        </div>
        <div className="flex-1" />
        <div className="relative w-44">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled" aria-hidden />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari aplikasi"
            aria-label="Cari aplikasi"
            className={cn(INPUT, 'pl-8')}
          />
        </div>
        <button
          type="button"
          onClick={fetchProcesses}
          disabled={isLoading}
          aria-label="Muat ulang daftar aplikasi"
          className={`w-9 h-9 flex items-center justify-center rounded-sm border border-hairline text-text-secondary hover:text-text-primary hover:bg-surface-3 disabled:opacity-50 ${FOCUS}`}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'motion-safe:animate-spin' : ''}`} aria-hidden />
        </button>
      </div>

      {feedback && (
        <p role="status" className={`px-4 py-2 border-b border-hairline text-[13px] ${feedback.ok ? 'text-success' : 'text-error'}`}>{feedback.text}</p>
      )}

      <div className="min-h-[260px] max-h-[420px] overflow-y-auto custom-scrollbar" aria-busy={isLoading}>
        {loadError ? (
          <div className="p-4"><ErrorLine message={loadError} onRetry={fetchProcesses} /></div>
        ) : !processes ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] font-medium text-text-secondary">Tidak ada game atau aplikasi yang terbuka</p>
            <p className="text-[12px] text-text-muted mt-1">Hanya program dengan jendela yang ditampilkan, proses Windows dan billing tidak.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-text-muted">Tidak ada aplikasi yang cocok dengan pencarian.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface-2 border-b border-hairline z-10">
              <tr>
                <th className={TH}>Aplikasi</th>
                <th className={`${TH} text-right`}>RAM</th>
                <th className={`${TH} text-right`}><span className="sr-only">Tindakan</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.map(proc => {
                const cat = CATEGORY_BY_ID[proc.category] || CATEGORY_BY_ID.other;
                const hung = proc.status === 'not_responding';
                return (
                  <tr key={`${proc.pid}-${proc.name}`} className="hover:bg-surface-3/50">
                    <td className={`${TD} max-w-0 w-full`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <cat.Icon className={`w-4 h-4 flex-none ${cat.tone}`} aria-hidden />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate font-medium text-text-primary">{proc.windowTitle || proc.name}</span>
                            {hung && <span className="flex-none inline-flex items-center h-5 px-1.5 rounded-xs bg-error/15 text-[11px] font-medium text-error">Tidak merespon</span>}
                          </div>
                          {proc.windowTitle && <div className="truncate text-[11px] font-mono text-text-muted">{proc.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} text-right font-mono tabular text-text-secondary whitespace-nowrap`}>{proc.memoryMb.toLocaleString('id-ID')} MB</td>
                    <td className={`${TD} text-right`}>
                      <button
                        type="button"
                        onClick={() => setConfirmItem(proc)}
                        disabled={killingPid !== null}
                        className={cn(BTN_GHOST, 'text-error hover:bg-error/10 whitespace-nowrap disabled:opacity-50')}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        {killingPid === proc.pid ? 'Menutup' : 'Tutup paksa'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-hairline text-[12px] text-text-muted">
        <span>Proses Windows dan billing tidak bisa ditutup dari sini.</span>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Selesai</button>
      </div>

      <ConfirmModal
        isOpen={!!confirmItem}
        title="Tutup paksa aplikasi?"
        description={confirmItem ? `${confirmItem.windowTitle || confirmItem.name} akan ditutup paksa.` : ''}
        detail="Progres game atau file yang belum disimpan bisa hilang."
        confirmText="Tutup paksa"
        onConfirm={() => confirmItem && handleKill(confirmItem)}
        onClose={() => setConfirmItem(null)}
      />
    </Modal>
  );
};
