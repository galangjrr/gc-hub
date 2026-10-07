import React, { useState, useEffect, useMemo } from 'react';
import { Workstation } from '../../../shared/types';
import { RemoteProcessItem } from '../../../shared/protocol';
import { RefreshCw, Search, Gamepad2, Globe, AppWindow, Cpu, ShieldCheck, Trash2 } from 'lucide-react';
import { Modal, BTN_SECONDARY, BTN_GHOST, FOCUS, INPUT, TH, TD, SkeletonRows } from '../../../shared/ui/primitives';
import { ConfirmModal } from '../../../shared/ui/ConfirmModal';
import { cn } from '../../../shared/ui/utils';

interface RemoteTaskManagerModalProps {
  isOpen: boolean;
  pc: Workstation | null;
  onClose: () => void;
  onKillProcess: (pc: Workstation, pid: number, processName: string) => void;
  onRefreshProcessList?: (pc: Workstation) => void;
  processList?: RemoteProcessItem[];
  isLoading?: boolean;
}

type Category = RemoteProcessItem['category'];

const CATEGORIES: { id: Category; label: string; Icon: React.FC<{ className?: string }>; tone: string }[] = [
  { id: 'game', label: 'Game', Icon: Gamepad2, tone: 'text-success' },
  { id: 'browser', label: 'Browser', Icon: Globe, tone: 'text-info' },
  { id: 'app', label: 'Aplikasi', Icon: AppWindow, tone: 'text-primary' },
  { id: 'background', label: 'Latar belakang', Icon: Cpu, tone: 'text-warning' },
  { id: 'system', label: 'Sistem', Icon: ShieldCheck, tone: 'text-text-muted' },
  { id: 'other', label: 'Lainnya', Icon: AppWindow, tone: 'text-text-muted' },
];
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

export const RemoteTaskManagerModal: React.FC<RemoteTaskManagerModalProps> = ({
  isOpen,
  pc,
  onClose,
  onKillProcess,
  onRefreshProcessList,
  processList = [],
  isLoading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [confirmKill, setConfirmKill] = useState<RemoteProcessItem | null>(null);

  useEffect(() => {
    if (!isOpen || !autoRefresh || !pc || !onRefreshProcessList) return;
    const interval = setInterval(() => onRefreshProcessList(pc), 4000);
    return () => clearInterval(interval);
  }, [isOpen, autoRefresh, pc, onRefreshProcessList]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of processList) map[p.category] = (map[p.category] || 0) + 1;
    return map;
  }, [processList]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return processList.filter(p =>
      (category === 'all' || p.category === category) &&
      (!query || p.name.toLowerCase().includes(query) || (p.windowTitle || '').toLowerCase().includes(query) || String(p.pid).includes(query))
    );
  }, [processList, category, searchQuery]);

  const totalMemMb = useMemo(() => processList.reduce((acc, p) => acc + (p.memoryMb || 0), 0), [processList]);

  if (!isOpen || !pc) return null;

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
    <Modal title={`Task Manager — ${pc.name}`} onClose={confirmKill ? () => setConfirmKill(null) : onClose} width={960}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-hairline">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter kategori">
          {tab('all', 'Semua', processList.length)}
          {CATEGORIES.map(c => tab(c.id, c.label, counts[c.id] || 0, c.Icon))}
        </div>
        <div className="flex-1" />
        <div className="relative w-48">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled" aria-hidden />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau PID"
            aria-label="Cari proses"
            className={cn(INPUT, 'pl-8')}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="w-4 h-4 accent-primary cursor-pointer" />
          Segarkan tiap 4 detik
        </label>
        <button
          type="button"
          onClick={() => onRefreshProcessList?.(pc)}
          disabled={isLoading}
          aria-label="Muat ulang daftar proses"
          className={`w-9 h-9 flex items-center justify-center rounded-sm border border-hairline text-text-secondary hover:text-text-primary hover:bg-surface-3 disabled:opacity-50 ${FOCUS}`}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </div>

      <div className="min-h-[300px] max-h-[460px] overflow-y-auto custom-scrollbar">
        {isLoading && processList.length === 0 ? (
          <div className="p-4"><SkeletonRows rows={6} /></div>
        ) : processList.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] font-medium text-text-secondary">Belum ada data proses dari {pc.name}</p>
            <p className="text-[12px] text-text-muted mt-1">PC mungkin offline. Tekan muat ulang untuk meminta lagi.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-text-muted">Tidak ada proses yang cocok dengan filter.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface-2 border-b border-hairline z-10">
              <tr>
                <th className={TH}>Aplikasi</th>
                <th className={TH}>Kategori</th>
                <th className={`${TH} text-right`}>PID</th>
                <th className={`${TH} text-right`}>RAM</th>
                <th className={`${TH} text-right`}><span className="sr-only">Tindakan</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.map(proc => {
                const cat = CATEGORY_BY_ID[proc.category] || CATEGORY_BY_ID.system;
                return (
                  <tr key={`${proc.pid}-${proc.name}`} className="hover:bg-surface-3/50">
                    <td className={`${TD} max-w-0 w-full`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <cat.Icon className={`w-4 h-4 flex-none ${cat.tone}`} aria-hidden />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate font-medium text-text-primary">{proc.windowTitle || proc.name}</span>
                            {proc.status === 'not_responding' && <span className="flex-none inline-flex items-center h-5 px-1.5 rounded-xs bg-error/15 text-[11px] font-medium text-error">Tidak merespon</span>}
                          </div>
                          {proc.windowTitle && <div className="truncate text-[11px] font-mono text-text-muted">{proc.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-text-secondary`}>{cat.label}</td>
                    <td className={`${TD} text-right font-mono tabular text-text-muted`}>{proc.pid}</td>
                    <td className={`${TD} text-right font-mono tabular text-text-primary whitespace-nowrap`}>{proc.memoryMb.toLocaleString('id-ID')} MB</td>
                    <td className={`${TD} text-right`}>
                      {proc.isProtected ? (
                        <span className="text-[11px] text-text-muted whitespace-nowrap">Dilindungi</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmKill(proc)}
                          className={cn(BTN_GHOST, 'text-error hover:bg-error/10 whitespace-nowrap')}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                          End task
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-hairline text-[12px] text-text-muted">
        <span>
          <strong className="font-mono tabular text-text-primary">{filtered.length}</strong> proses, total RAM{' '}
          <strong className="font-mono tabular text-text-primary">{(totalMemMb / 1024).toFixed(2)} GB</strong>
        </span>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Tutup</button>
      </div>

      <ConfirmModal
        isOpen={!!confirmKill}
        title="Hentikan proses?"
        description={confirmKill ? `${confirmKill.name} (PID ${confirmKill.pid}) di ${pc.name} akan ditutup paksa.` : ''}
        detail="Data yang belum disimpan di aplikasi itu bisa hilang."
        confirmText="Hentikan"
        onConfirm={() => confirmKill && onKillProcess(pc, confirmKill.pid, confirmKill.name)}
        onClose={() => setConfirmKill(null)}
      />
    </Modal>
  );
};
