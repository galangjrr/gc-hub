import React, { useState, useEffect } from 'react';
import { SystemLogRecord } from '../../shared/types';
import { RotateCw, Eraser, Search, ChevronLeft, ChevronRight, Server, Monitor } from 'lucide-react';
import { INPUT, BTN_GHOST, TH, TD } from '../../shared/ui/primitives';
import { cn } from '../../shared/ui/utils';

interface LogViewProps {
  clientLogs: SystemLogRecord[];
  serverLogs: SystemLogRecord[];
}

function StatusBadge({ status }: { status: SystemLogRecord['status'] }) {
  const getBadgeClass = () => {
    switch (status) {
      case 'Tersedia':
        return 'bg-primary/15 text-primary';
      case 'Online':
        return 'bg-info/15 text-info';
      case 'Offline':
        return 'bg-surface-3 text-text-disabled';
      case 'Peringatan':
        return 'bg-error/15 text-error';
      default:
        return 'bg-surface-3 text-text-muted';
    }
  };

  return (
    <span className={`px-1.5 py-0.5 rounded-xs text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${getBadgeClass()}`}>
      {status || 'Unknown'}
    </span>
  );
}

export const LogView: React.FC<LogViewProps> = ({ clientLogs, serverLogs }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [logType, setLogType] = useState<'client' | 'server'>('client');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [searchFilter, setSearchFilter] = useState<'username' | 'pcName' | 'note'>('username');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 100;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedLogId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeLogs = logType === 'client' ? clientLogs : serverLogs;

  const filteredLogs = activeLogs.filter(log => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (searchFilter === 'username') return log.username?.toLowerCase().includes(q);
    if (searchFilter === 'pcName') return (log.pcName || '').toLowerCase().includes(q);
    if (searchFilter === 'note') return log.note?.toLowerCase().includes(q);
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const paged = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex-1 flex flex-col overflow-hidden select-none bg-canvas text-text-primary text-[13px]">

      {/* ── Toolbar Header ───────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-surface-1 border-b border-hairline">

        {/* Sub-tabs */}
        <div className="flex items-center gap-1">
          {[
            { key: 'client', label: 'Log Klien', Icon: Monitor },
            { key: 'server', label: 'Log Server', Icon: Server },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setLogType(key as 'client' | 'server'); setCurrentPage(1); }}
              className={`flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] border-b-2 transition-colors ${
                logType === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Filters and Search */}
        <div className="flex items-center gap-3">
          {/* Date range */}
          <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
            <label htmlFor="log-start-date" className="sr-only">Dari tanggal</label>
            <input
              id="log-start-date"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className={cn(INPUT, 'h-8 w-[138px] font-mono tabular')}
            />
            <span aria-hidden>sampai</span>
            <label htmlFor="log-end-date" className="sr-only">Sampai tanggal</label>
            <input
              id="log-end-date"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className={cn(INPUT, 'h-8 w-[138px] font-mono tabular')}
            />
          </div>

          <div className="h-4 w-px bg-hairline" />

          {/* Search Dropdown + Field */}
          <div className="flex items-center gap-1.5">
            <select
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value as any)}
              className={cn(INPUT, 'h-8 w-28 text-[12px]')}
            >
              <option value="username">Username</option>
              <option value="pcName">Bilik PC</option>
              <option value="note">Catatan</option>
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Cari isi log..."
                className={cn(INPUT, 'h-8 pl-8 text-[12px] w-40')}
              />
            </div>

            <button
              type="button"
              onClick={() => { setCurrentPage(1); setSearchQuery(''); }}
              className={cn(BTN_GHOST, 'text-text-muted hover:text-text-primary')}
              title="Reset Filter"
            >
              <RotateCw className="w-3.5 h-3.5" aria-hidden />
            </button>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={cn(BTN_GHOST, 'text-text-muted hover:text-text-primary')}
                title="Hapus Pencarian"
              >
                <Eraser className="w-3.5 h-3.5" aria-hidden />
              </button>
            )}
          </div>

          <div className="h-4 w-px bg-hairline" />

          {/* Pagination */}
          <div className="flex items-center gap-1 text-[12px] text-text-muted">
            <span>Hal:</span>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="w-7 h-7 flex items-center justify-center rounded-sm bg-surface-2 border border-hairline text-text-secondary hover:border-hairline-strong disabled:opacity-30 disabled:pointer-events-none transition-colors"
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 py-0.5 rounded-sm bg-surface-2 border border-hairline text-text-primary font-mono tabular min-w-[28px] text-center">
              {currentPage}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="w-7 h-7 flex items-center justify-center rounded-sm bg-surface-2 border border-hairline text-text-secondary hover:border-hairline-strong disabled:opacity-30 disabled:pointer-events-none transition-colors"
              aria-label="Halaman berikutnya"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <span>/ {totalPages}</span>
          </div>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-auto"
        onClick={(e) => {
          if ((e.target as HTMLElement).tagName === 'DIV' || (e.target as HTMLElement).tagName === 'TABLE' || (e.target as HTMLElement).tagName === 'TBODY') {
            setSelectedLogId(null);
          }
        }}
      >
        <table className="w-full text-left border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface-2 border-b border-hairline">
            <tr>
              <th className={TH}>Bilik PC</th>
              <th className={TH}>Username</th>
              <th className={TH}>Status</th>
              <th className={TH}>Tanggal</th>
              <th className={TH}>Waktu</th>
              <th className={TH}>Durasi</th>
              <th className={TH}>Catatan Aktivitas</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((log) => {
              const sel = log.id === selectedLogId;
              return (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLogId(prev => prev === log.id ? null : (log.id as number))}
                  className={`cursor-pointer transition-colors border-b border-hairline ${
                    sel ? 'bg-surface-3' : 'hover:bg-surface-2/60'
                  }`}
                >
                  <td className={`${TD} font-semibold ${sel ? 'text-primary' : 'text-text-primary'}`}>
                    {log.pcName || 'Server'}
                  </td>
                  <td className={`${TD} text-text-secondary`}>{log.username || '—'}</td>
                  <td className={TD}><StatusBadge status={log.status} /></td>
                  <td className={`${TD} text-text-muted font-mono tabular`}>{log.date}</td>
                  <td className={`${TD} text-text-muted font-mono tabular`}>{log.time}</td>
                  <td className={`${TD} text-info font-mono tabular`}>{log.usedDuration || '—'}</td>
                  <td className={`${TD} text-text-muted`}>{log.note || '—'}</td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 text-center text-text-disabled">
                  Tidak ada catatan aktivitas untuk filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between px-4 py-1.5 text-[11px] bg-surface-1 border-t border-hairline text-text-muted">
        <div className="flex items-center gap-4">
          <span>Total Baris: <strong className="text-text-primary font-mono tabular">{filteredLogs.length}</strong></span>
          <span>Tipe Log: <strong className="text-primary">{logType === 'client' ? 'Klien Kiosk' : 'Server Utama'}</strong></span>
        </div>
        <span>Klik baris untuk menyorot. Tekan Esc untuk melepas pilihan.</span>
      </div>
    </div>
  );
};
