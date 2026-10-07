import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Download } from 'lucide-react';
import { ShiftRecord, ShiftAuditSummary, TransactionRecord } from '../../shared/types';
import { classifyTransaction, summarizeCash, formatRp, todayIso, txTimestamp, TX_KIND_LABEL, TX_SOURCE_LABEL, CashSummary } from '../../shared/transactions';
import { api, INPUT, BTN_SECONDARY, FOCUS, TH, TD, ErrorLine, SkeletonRows, DateRange } from '../../shared/ui/primitives';
import { useTransactionRange } from './TransactionView';
import { cn } from '../../shared/ui/utils';

// Revenue report: drawer cash per day for a date range, plus shift reconciliation.
// Money paid from member balance is shown apart because it was already counted as cash
// when the member topped up.

type Mode = 'pendapatan' | 'shift';
const ALL_STAFF = '';

export const RevenueReportView: React.FC = () => {
  const [mode, setMode] = useState<Mode>('pendapatan');

  const modeSwitch = (
    <div role="group" aria-label="Jenis laporan" className="inline-flex p-0.5 rounded-sm bg-surface-2 border border-hairline">
      {([['pendapatan', 'Pendapatan'], ['shift', 'Shift kasir']] as const).map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={mode === id}
          onClick={() => setMode(id)}
          className={`h-8 px-3 rounded-xs text-[13px] font-medium transition-colors duration-150 ${FOCUS} ${mode === id ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-surface-1">
      {mode === 'pendapatan' ? <RevenuePanel modeSwitch={modeSwitch} /> : <ShiftPanel modeSwitch={modeSwitch} />}
    </div>
  );
};

const Header: React.FC<{ modeSwitch: React.ReactNode; children?: React.ReactNode }> = ({ modeSwitch, children }) => (
  <div className="flex-none flex flex-wrap items-center gap-3 px-6 pt-5 pb-4">
    <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-text-primary mr-2">Laporan</h1>
    {modeSwitch}
    {children}
  </div>
);

const RevenuePanel: React.FC<{ modeSwitch: React.ReactNode }> = ({ modeSwitch }) => {
  const today = todayIso();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [staff, setStaff] = useState(ALL_STAFF);
  const { rows, error, invalid, reload } = useTransactionRange(from, to);

  const staffList = useMemo(() => Array.from(new Set((rows || []).map(r => r.staff))).sort(), [rows]);
  const scoped = useMemo(() => (rows || []).filter(r => !staff || r.staff === staff), [rows, staff]);
  const total = useMemo(() => summarizeCash(scoped), [scoped]);

  // One row per calendar day, newest first
  const days = useMemo(() => {
    const byDay = new Map<string, TransactionRecord[]>();
    for (const r of scoped) byDay.set(r.date, [...(byDay.get(r.date) || []), r]);
    return Array.from(byDay, ([date, list]) => ({ date, sum: summarizeCash(list) }))
      .sort((a, b) => (txTimestamp(b.date) ?? 0) - (txTimestamp(a.date) ?? 0));
  }, [scoped]);

  const exportCsv = () => {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ['ID', 'Tanggal', 'Jam', 'Pelanggan', 'Staf', 'Jenis', 'Sumber', 'Nominal', 'Catatan'].map(q).join(';'),
      ...scoped.map(r => {
        const c = classifyTransaction(r.note, r.price);
        return [r.id, r.date, r.time, r.username, r.staff, TX_KIND_LABEL[c.kind], TX_SOURCE_LABEL[c.source], r.price, r.note].map(q).join(';');
      }),
    ];
    // BOM so Excel opens the file as UTF-8; semicolons because id-ID Excel uses comma decimals
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_${from}_${to}${staff ? `_${staff}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  let body: React.ReactNode;
  if (invalid) {
    body = <p role="alert" className="text-[13px] text-error">Tanggal awal harus sebelum atau sama dengan tanggal akhir.</p>;
  } else if (error) {
    body = <ErrorLine message={error} onRetry={reload} />;
  } else if (rows === null) {
    body = <><div className="h-[88px] rounded-md bg-surface-3 animate-pulse" aria-hidden /><SkeletonRows rows={4} /></>;
  } else if (scoped.length === 0) {
    body = <p className="text-[13px] text-text-muted">Belum ada transaksi pada rentang ini{staff ? ` untuk ${staff}` : ''}. Pilih tanggal lain atau lihat semua staf.</p>;
  } else {
    body = (
      <>
        <Summary s={total} />
        <section aria-labelledby="per-day" className="bg-surface-2 border border-hairline rounded-md">
          <h2 id="per-day" className="px-4 h-11 flex items-center text-[15px] font-semibold text-text-primary border-b border-hairline">Per hari</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className={`${TH} pl-4`}>Tanggal</th>
                <th scope="col" className={`${TH} text-right`}>Transaksi</th>
                <th scope="col" className={`${TH} text-right`}>Billing PC</th>
                <th scope="col" className={`${TH} text-right`}>F&amp;B</th>
                <th scope="col" className={`${TH} text-right`}>Top up</th>
                <th scope="col" className={`${TH} text-right`}>Refund</th>
                <th scope="col" className={`${TH} text-right pr-4`}>Bersih</th>
              </tr>
            </thead>
            <tbody>
              {days.map(({ date, sum }) => (
                <tr key={date} className="border-b border-hairline last:border-b-0">
                  <td className={`${TD} pl-4 font-mono tabular text-text-primary`}>{date}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-secondary`}>{sum.count}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-secondary`}>{formatRp(sum.billing)}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-secondary`}>{formatRp(sum.fnb)}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-secondary`}>{formatRp(sum.topup)}</td>
                  <td className={`${TD} text-right font-mono tabular ${sum.cashOut ? 'text-error' : 'text-text-disabled'}`}>{formatRp(-sum.cashOut)}</td>
                  <td className={`${TD} text-right pr-4 font-mono tabular font-semibold text-text-primary`}>{formatRp(sum.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
    );
  }

  return (
    <>
      <Header modeSwitch={modeSwitch}>
        <DateRange from={from} to={to} today={today} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <label htmlFor="report-staff" className="sr-only">Staf</label>
        <div className="w-44">
          <select id="report-staff" value={staff} onChange={e => setStaff(e.target.value)} className={cn(INPUT, 'h-8')}>
            <option value={ALL_STAFF}>Semua staf</option>
            {staffList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        <button type="button" onClick={exportCsv} disabled={scoped.length === 0} className={cn(BTN_SECONDARY, 'h-8')}>
          <Download className="w-3.5 h-3.5" aria-hidden /> Ekspor CSV
        </button>
      </Header>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 pb-6 space-y-4">{body}</div>
    </>
  );
};

// Net cash leads; the parts it is made of follow in one row, not as equal cards.
const Summary: React.FC<{ s: CashSummary }> = ({ s }) => {
  const parts: { label: string; value: number; tone?: string }[] = [
    { label: 'Billing PC', value: s.billing },
    { label: 'F&B', value: s.fnb },
    { label: 'Top up member', value: s.topup },
    { label: 'Refund tunai', value: -s.cashOut, tone: s.cashOut ? 'text-error' : 'text-text-disabled' },
  ];
  return (
    <section aria-label="Ringkasan tunai" className="flex flex-wrap items-stretch bg-surface-2 border border-hairline rounded-md">
      <div className="px-4 py-3 min-w-[220px] border-r border-hairline">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">Tunai bersih</div>
        <div className="mt-1 font-mono tabular text-[28px] leading-8 font-semibold text-primary">{formatRp(s.net)}</div>
        <div className="mt-1 text-[12px] text-text-muted">{s.count.toLocaleString('id-ID')} transaksi, masuk {formatRp(s.cashIn)}</div>
      </div>
      {parts.map(p => (
        <div key={p.label} className="px-4 py-3 min-w-[140px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">{p.label}</div>
          <div className={`mt-1 font-mono tabular text-[15px] font-semibold ${p.tone || 'text-text-primary'}`}>{formatRp(p.value)}</div>
        </div>
      ))}
      {/* Revenue that never touched the drawer */}
      <div className="px-4 py-3 ml-auto min-w-[220px]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">Di luar laci</div>
        <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[13px]">
          <dt className="text-text-muted" title="Dibayar dari saldo; uangnya masuk laci saat top up">Saldo member</dt>
          <dd className="text-right font-mono tabular font-medium text-text-secondary">{formatRp(s.fromBalance)}</dd>
          {s.transfer > 0 && (
            <>
              <dt className="text-text-muted" title="Booking lunas online sebelum datang">Transfer booking</dt>
              <dd className="text-right font-mono tabular font-medium text-text-secondary">{formatRp(s.transfer)}</dd>
            </>
          )}
        </dl>
      </div>
    </section>
  );
};

const ShiftPanel: React.FC<{ modeSwitch: React.ReactNode }> = ({ modeSwitch }) => {
  const [shifts, setShifts] = useState<ShiftRecord[] | null>(null);
  const [active, setActive] = useState<ShiftAuditSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, summary] = await Promise.all([api()?.getShiftHistory?.(60), api()?.getActiveShift?.()]);
      setShifts(Array.isArray(list) ? list : []);
      setActive(summary || null);
    } catch {
      setError('Riwayat shift gagal dimuat dari database.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => api()?.onTransactionAdded?.(() => load()), [load]);

  let body: React.ReactNode;
  if (error) {
    body = <ErrorLine message={error} onRetry={load} />;
  } else if (shifts === null) {
    body = <SkeletonRows rows={6} />;
  } else if (shifts.length === 0) {
    body = <p className="text-[13px] text-text-muted">Belum ada shift tercatat. Sistem shift diaktifkan admin di Pengaturan, tab Shift.</p>;
  } else {
    body = (
      <section aria-label="Riwayat shift" className="bg-surface-2 border border-hairline rounded-md">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className={`${TH} pl-4`}>Kasir</th>
              <th scope="col" className={TH}>Mulai</th>
              <th scope="col" className={TH}>Selesai</th>
              <th scope="col" className={`${TH} text-right`}>Modal awal</th>
              <th scope="col" className={`${TH} text-right`}>Masuk</th>
              <th scope="col" className={`${TH} text-right`}>Keluar</th>
              <th scope="col" className={`${TH} text-right`}>Seharusnya</th>
              <th scope="col" className={`${TH} text-right`}>Uang fisik</th>
              <th scope="col" className={`${TH} text-right pr-4`}>Selisih</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map(s => {
              const open = s.status === 1;
              const live = open && active?.currentShift.id === s.id ? active : null;
              const cashIn = live ? live.totalCashIn : s.totalCashIn;
              const cashOut = live ? live.totalCashOut : s.totalCashOut;
              const expected = live ? live.expectedEndCash : s.expectedCash;
              return (
                <tr key={s.id} className={`border-b border-hairline last:border-b-0 ${open ? 'bg-primary/5' : ''}`}>
                  <td className={`${TD} pl-4 font-medium text-text-primary`}>
                    {s.employeeName}
                    {open && <span className="ml-2 inline-flex items-center h-5 px-1.5 rounded-xs bg-primary/15 text-[11px] font-medium text-primary">Berjalan</span>}
                  </td>
                  <td className={`${TD} font-mono tabular text-[12px] text-text-secondary whitespace-nowrap`}>{s.startDateFormatted}</td>
                  <td className={`${TD} font-mono tabular text-[12px] text-text-secondary whitespace-nowrap`}>{open ? '-' : s.endDateFormatted}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-secondary`}>{formatRp(s.startCash)}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-primary`}>{live || !open ? formatRp(cashIn) : '-'}</td>
                  <td className={`${TD} text-right font-mono tabular ${cashOut ? 'text-error' : 'text-text-disabled'}`}>{live || !open ? formatRp(-cashOut) : '-'}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-primary`}>{live || !open ? formatRp(expected) : '-'}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-primary`}>{open ? '-' : formatRp(s.endCash)}</td>
                  <td className={`${TD} text-right pr-4 font-mono tabular font-semibold ${open ? 'text-text-disabled' : s.variance < 0 ? 'text-error' : s.variance > 0 ? 'text-warning' : 'text-text-muted'}`}>
                    {open ? '-' : s.variance > 0 ? `+${formatRp(s.variance)}` : formatRp(s.variance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <>
      <Header modeSwitch={modeSwitch} />
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 pb-6">
        {body}
        {shifts && shifts.length > 0 && (
          <p className="mt-3 text-[12px] text-text-muted max-w-[65ch]">
            Selisih = uang fisik saat serah terima dikurangi seharusnya. Minus berarti laci kurang, plus berarti laci lebih.
          </p>
        )}
      </div>
    </>
  );
};
