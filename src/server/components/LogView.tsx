import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { SystemLogEntry } from '../../shared/types';
import { todayIso } from '../../shared/transactions';
import { api, INPUT, TH, TD, ErrorLine, SkeletonRows, DateRange } from '../../shared/ui/primitives';
import { cn } from '../../shared/ui/utils';

// Activity log: everything written to SystemLogs (staff actions, corrections, restores, renames,
// restock, voucher, booth events) for a date range, newest first. Read only.

const PAGE_SIZE = 100;
// Rows grow with long descriptions, so every cell pads the same instead of the fixed TD height
const ROW = 'h-auto py-2.5';

const LEVEL: Record<SystemLogEntry['level'], { label: string; className: string }> = {
  0: { label: 'Info', className: 'bg-surface-3 text-text-muted' },
  1: { label: 'Penting', className: 'bg-warning/15 text-warning' },
  2: { label: 'Error', className: 'bg-error/15 text-error' },
};

const when = (ms: number) =>
  new Date(ms).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const LogView: React.FC = () => {
  const today = todayIso();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: SystemLogEntry[]; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invalid = !from || !to || from > to;

  const load = useCallback(async () => {
    if (invalid) return;
    setError(null);
    try {
      const res = await api()?.getSystemLogs?.({ startDate: from, endDate: to });
      if (!res?.success) throw new Error(res?.message);
      setData({ rows: res.rows, truncated: res.truncated });
    } catch (err: any) {
      setError(err?.message || 'Log gagal dimuat dari database.');
    }
  }, [from, to, invalid]);

  useEffect(() => { setData(null); setPage(1); load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows || []).filter(r => !q || r.description.toLowerCase().includes(q));
  }, [data, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  let body: React.ReactNode;
  if (invalid) {
    body = <p role="alert" className="text-[13px] text-error">Tanggal awal harus sebelum atau sama dengan tanggal akhir.</p>;
  } else if (error) {
    body = <ErrorLine message={error} onRetry={load} />;
  } else if (data === null) {
    body = <SkeletonRows rows={8} />;
  } else if (filtered.length === 0) {
    body = (
      <p className="text-[13px] text-text-muted">
        {query ? `Tidak ada log yang memuat "${query}" pada rentang ini.` : 'Belum ada aktivitas tercatat pada rentang ini. Pilih tanggal lain.'}
      </p>
    );
  } else {
    body = (
      <section aria-label="Daftar log" className="bg-surface-2 border border-hairline rounded-md">
        <table className="w-full border-collapse">
          <thead className="border-b border-hairline">
            <tr>
              <th scope="col" className={`${TH} pl-4 w-[170px]`}>Waktu</th>
              <th scope="col" className={`${TH} w-[96px]`}>Tingkat</th>
              <th scope="col" className={`${TH} pr-4`}>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(r => (
              <tr key={r.id} className="border-b border-hairline last:border-b-0 align-top">
                <td className={cn(TD, ROW, 'pl-4 font-mono tabular text-[12px] leading-5 text-text-secondary whitespace-nowrap')}>{when(r.eventTime)}</td>
                <td className={cn(TD, ROW)}>
                  <span className={`inline-flex items-center h-5 px-1.5 rounded-xs text-[11px] font-semibold ${LEVEL[r.level].className}`}>{LEVEL[r.level].label}</span>
                </td>
                <td className={cn(TD, ROW, 'pr-4 leading-5 text-text-primary break-words')}>{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-surface-1">
      <div className="flex-none flex flex-wrap items-center gap-3 px-6 pt-5 pb-4">
        <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-text-primary mr-2">Log Aktivitas</h1>
        <DateRange from={from} to={to} today={today} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
          <label htmlFor="log-search" className="sr-only">Cari isi log</label>
          <input id="log-search" className={cn(INPUT, 'h-8 pl-8')} value={query} placeholder="Cari nama, PC, atau kata kunci"
            onChange={e => { setQuery(e.target.value); setPage(1); }} />
        </div>
        <div className="flex-1" />
        {filtered.length > PAGE_SIZE && (
          <nav aria-label="Halaman log" className="flex items-center gap-1 text-[12px] text-text-muted">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Halaman sebelumnya"
              className="w-8 h-8 flex items-center justify-center rounded-sm border border-hairline bg-surface-2 hover:border-hairline-strong disabled:opacity-30">
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden />
            </button>
            <span className="px-2 font-mono tabular text-text-primary">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} aria-label="Halaman berikutnya"
              className="w-8 h-8 flex items-center justify-center rounded-sm border border-hairline bg-surface-2 hover:border-hairline-strong disabled:opacity-30">
              <ChevronRight className="w-3.5 h-3.5" aria-hidden />
            </button>
          </nav>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 pb-6 space-y-3">
        {body}
        {data?.truncated && !error && (
          <p className="text-[12px] text-text-muted">Rentang ini punya lebih dari {data.rows.length.toLocaleString('id-ID')} log, yang tampil hanya yang terbaru. Persempit tanggalnya untuk melihat sisanya.</p>
        )}
      </div>
    </div>
  );
};
