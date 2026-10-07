import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { TransactionRecord } from '../../shared/types';
import { classifyTransaction, summarizeCash, formatRp, todayIso, TX_KIND_LABEL, TX_SOURCE_LABEL, TxKind } from '../../shared/transactions';
import { api, denied, INPUT, BTN_PRIMARY, BTN_SECONDARY, BTN_GHOST, FOCUS, TH, TD, ErrorLine, SkeletonRows, DateRange, Field, Modal } from '../../shared/ui/primitives';
import { ConfirmModal } from '../../shared/ui/ConfirmModal';
import { cn } from '../../shared/ui/utils';

// Transaction log for one day range. Rows come straight from DbService.getTransactions and
// refresh whenever the engine records a new one. Admins can correct or delete a wrong row;
// the server re-checks the role and keeps an audit trail.

// Loads every row in [from, to]; `rows` is null while loading.
export function useTransactionRange(from: string, to: string) {
  const [rows, setRows] = useState<TransactionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invalid = !from || !to || from > to;

  const load = useCallback(async () => {
    if (invalid) return;
    setError(null);
    try {
      const list = await api()?.getTransactions?.({ startDate: from, endDate: to });
      setRows(Array.isArray(list) ? list : []);
    } catch {
      setError('Transaksi gagal dimuat dari database.');
    }
  }, [from, to, invalid]);

  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => api()?.onTransactionAdded?.(() => load()), [load]);

  return { rows, error, invalid, reload: load };
}

type KindFilter = 'semua' | TxKind;
const KIND_FILTERS: KindFilter[] = ['semua', 'billing', 'fnb', 'topup', 'refund', 'handover'];
const PAGE_SIZE = 100;

interface TransactionViewProps {
  isAdmin: boolean;
  onToast: (title: string, message: string) => void;
}

export const TransactionView: React.FC<TransactionViewProps> = ({ isAdmin, onToast }) => {
  const today = todayIso();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const { rows, error, invalid, reload } = useTransactionRange(from, to);
  const [kind, setKind] = useState<KindFilter>('semua');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<TransactionRecord | null>(null);
  const [deleting, setDeleting] = useState<TransactionRecord | null>(null);

  const classified = useMemo(
    () => (rows || []).map(r => ({ r, c: classifyTransaction(r.note, Number(r.price) || 0) })),
    [rows]
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classified.filter(({ r, c }) =>
      (kind === 'semua' || c.kind === kind) &&
      (!q || r.username.toLowerCase().includes(q) || r.staff.toLowerCase().includes(q) || r.note.toLowerCase().includes(q))
    );
  }, [classified, kind, query]);
  const totals = useMemo(() => summarizeCash(visible.map(v => v.r)), [visible]);

  useEffect(() => setPage(1), [from, to, kind, query]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const remove = async () => {
    if (!deleting) return;
    const res = await api()?.deleteTransaction?.(deleting.id);
    setDeleting(null);
    onToast(denied(res) ? 'Hapus ditolak' : 'Transaksi dihapus', res?.message || 'Transaksi gagal dihapus.');
    reload();
  };

  let body: React.ReactNode;
  if (invalid) {
    body = <p className="px-6 py-4 text-[13px] text-error" role="alert">Tanggal awal harus sebelum atau sama dengan tanggal akhir.</p>;
  } else if (error) {
    body = <div className="px-6 py-4"><ErrorLine message={error} onRetry={reload} /></div>;
  } else if (rows === null) {
    body = <div className="px-6 py-4"><SkeletonRows rows={8} /></div>;
  } else if (rows.length === 0) {
    body = <p className="px-6 py-4 text-[13px] text-text-muted">Belum ada transaksi pada tanggal ini. Transaksi tercatat otomatis saat paket dibeli, sesi dibayar, F&amp;B terjual, atau saldo diisi.</p>;
  } else if (visible.length === 0) {
    body = <p className="px-6 py-4 text-[13px] text-text-muted">Tidak ada transaksi yang cocok. Ubah jenis atau kata kunci pencarian.</p>;
  } else {
    body = (
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-surface-1">
          <tr className="border-b border-hairline">
            <th scope="col" className={`${TH} pl-6`}>Waktu</th>
            <th scope="col" className={TH}>Pelanggan</th>
            <th scope="col" className={TH}>Jenis</th>
            <th scope="col" className={TH}>Catatan</th>
            <th scope="col" className={TH}>Staf</th>
            <th scope="col" className={`${TH} text-right ${isAdmin ? '' : 'pr-6'}`}>Nominal</th>
            {isAdmin && <th scope="col" className={`${TH} pr-6 w-[88px]`}><span className="sr-only">Aksi</span></th>}
          </tr>
        </thead>
        <tbody>
          {paged.map(({ r, c }) => (
            <tr key={r.id} className="border-b border-hairline hover:bg-surface-2 transition-colors duration-150">
              <td className={`${TD} pl-6 whitespace-nowrap font-mono tabular text-[12px] text-text-muted`}>
                {from !== to && <span className="text-text-secondary">{r.date} </span>}{r.time}
              </td>
              <td className={`${TD} font-medium text-text-primary max-w-[160px] truncate`} title={r.username}>{r.username}</td>
              <td className={`${TD} whitespace-nowrap`}>
                <span className="inline-flex items-center h-5 px-1.5 rounded-xs bg-surface-carbon text-[11px] text-text-secondary">{TX_KIND_LABEL[c.kind]}</span>
                {c.source !== 'cash' && c.kind !== 'handover' && (
                  <span className="ml-1 inline-flex items-center h-5 px-1.5 rounded-xs bg-info/15 text-[11px] text-info" title={`${TX_SOURCE_LABEL[c.source]}, bukan uang laci`}>
                    {c.source === 'transfer' ? 'Transfer' : 'Saldo'}
                  </span>
                )}
              </td>
              <td className={`${TD} text-text-secondary max-w-[420px] truncate`} title={r.note}>{r.note}</td>
              <td className={`${TD} text-text-secondary whitespace-nowrap`}>{r.staff}</td>
              <td className={`${TD} text-right font-mono tabular whitespace-nowrap ${isAdmin ? '' : 'pr-6'} ${r.price < 0 ? 'text-error' : c.source === 'cash' && c.kind !== 'handover' ? 'text-text-primary' : 'text-text-muted'}`}>
                {formatRp(r.price)}
              </td>
              {isAdmin && (
                <td className={`${TD} pr-6`}>
                  {c.kind !== 'handover' && (
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => setEditing(r)} aria-label={`Koreksi transaksi ${r.username} ${r.time}`} title="Koreksi" className={`w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3 ${FOCUS}`}>
                        <Pencil className="w-3.5 h-3.5" aria-hidden />
                      </button>
                      <button type="button" onClick={() => setDeleting(r)} aria-label={`Hapus transaksi ${r.username} ${r.time}`} title="Hapus" className={`w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:text-error hover:bg-error/10 ${FOCUS}`}>
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-surface-1">
      <div className="flex-none px-6 pt-5 pb-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-text-primary mr-2">Transaksi</h1>
          <DateRange from={from} to={to} today={today} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <div className="flex-1" />
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
            <label htmlFor="tx-search" className="sr-only">Cari transaksi</label>
            <input id="tx-search" className={cn(INPUT, 'h-8 pl-8')} value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari pelanggan, staf, catatan" />
          </div>
        </div>
        <div role="group" aria-label="Saring jenis transaksi" className="flex flex-wrap gap-1">
          {KIND_FILTERS.map(k => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`h-7 px-2.5 rounded-sm text-[12px] transition-colors duration-150 ${FOCUS} ${kind === k ? 'bg-surface-3 text-text-primary shadow-[inset_0_0_0_1px_rgb(var(--gc-hairline-strong))]' : 'text-text-muted hover:text-text-primary'}`}
            >
              {k === 'semua' ? 'Semua' : TX_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar border-t border-hairline">{body}</div>

      {rows && rows.length > 0 && !invalid && (
        <footer className="flex-none flex flex-wrap items-center gap-x-6 gap-y-1 px-6 h-11 border-t border-hairline bg-surface-2 text-[12px]">
          <span className="text-text-muted">{visible.length.toLocaleString('id-ID')} transaksi</span>
          <span className="text-text-muted">Tunai masuk <b className="font-mono tabular font-semibold text-text-primary">{formatRp(totals.cashIn)}</b></span>
          {totals.cashOut > 0 && <span className="text-text-muted">Refund tunai <b className="font-mono tabular font-semibold text-error">{formatRp(-totals.cashOut)}</b></span>}
          <span className="text-text-muted">Bersih <b className="font-mono tabular font-semibold text-primary">{formatRp(totals.net)}</b></span>
          {totals.transfer > 0 && <span className="text-text-muted">Transfer booking <b className="font-mono tabular font-medium text-text-secondary">{formatRp(totals.transfer)}</b></span>}
          {totals.fromBalance > 0 && <span className="text-text-muted">Dari saldo member <b className="font-mono tabular font-medium text-text-secondary">{formatRp(totals.fromBalance)}</b></span>}
          {pages > 1 && (
            <div className="ml-auto flex items-center gap-1" role="group" aria-label="Halaman">
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Halaman sebelumnya" className={cn(BTN_GHOST, 'w-8 justify-center text-text-secondary hover:bg-surface-3 disabled:opacity-40')}>
                <ChevronLeft className="w-4 h-4" aria-hidden />
              </button>
              <span className="font-mono tabular text-text-secondary">{page} / {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setPage(p => p + 1)} aria-label="Halaman berikutnya" className={cn(BTN_GHOST, 'w-8 justify-center text-text-secondary hover:bg-surface-3 disabled:opacity-40')}>
                <ChevronRight className="w-4 h-4" aria-hidden />
              </button>
            </div>
          )}
        </footer>
      )}

      {editing && (
        <CorrectionModal
          tx={editing}
          onClose={() => setEditing(null)}
          onSaved={message => { setEditing(null); onToast('Transaksi dikoreksi', message); reload(); }}
        />
      )}

      <ConfirmModal
        isOpen={!!deleting}
        title="Hapus transaksi?"
        description="Pakai ini untuk transaksi yang tidak seharusnya ada, misalnya tercatat dua kali. Isinya tetap tersimpan di log sistem."
        detail={deleting ? `${deleting.username}, ${deleting.date} ${deleting.time}, ${formatRp(deleting.price)}` : undefined}
        confirmText="Hapus"
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
};

const CorrectionModal: React.FC<{ tx: TransactionRecord; onClose: () => void; onSaved: (message: string) => void }> = ({ tx, onClose, onSaved }) => {
  const [price, setPrice] = useState(String(tx.price));
  const [note, setNote] = useState(tx.note);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const amount = Number(price);
  const priceError = price.trim() === '' || !Number.isFinite(amount) ? 'Isi nominal dalam rupiah, minus untuk uang keluar.' : '';
  const changed = amount !== tx.price;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (priceError || !note.trim()) return;
    setSaving(true);
    setError('');
    const res = await api()?.correctTransaction?.(tx.id, amount, note);
    setSaving(false);
    if (!res?.success) {
      setError(res?.message || 'Koreksi gagal disimpan.');
      return;
    }
    onSaved(res.message);
  };

  return (
    <Modal title="Koreksi transaksi" onClose={onClose} width={480}>
      <form onSubmit={save} className="p-4 space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
          <dt className="text-text-muted">Pelanggan</dt><dd className="text-text-primary">{tx.username}</dd>
          <dt className="text-text-muted">Waktu</dt><dd className="font-mono tabular text-text-primary">{tx.date} {tx.time}</dd>
          <dt className="text-text-muted">Staf</dt><dd className="text-text-primary">{tx.staff}</dd>
        </dl>
        <Field label="Nominal" htmlFor="fix-price" error={priceError} hint={changed ? `Tercatat ${formatRp(tx.price)}. Perubahan nominal ditulis di catatan dan log sistem.` : undefined}>
          <input id="fix-price" type="number" inputMode="numeric" step={100} value={price} onChange={e => setPrice(e.target.value)} className={cn(INPUT, 'font-mono tabular')} autoFocus />
        </Field>
        <Field label="Catatan" htmlFor="fix-note" error={note.trim() ? '' : 'Catatan wajib diisi.'}>
          <textarea id="fix-note" rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} className={cn(INPUT, 'h-auto py-2 resize-none')} />
        </Field>
        {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Batal</button>
          <button type="submit" disabled={saving || !!priceError || !note.trim()} className={BTN_PRIMARY}>{saving ? 'Menyimpan...' : 'Simpan koreksi'}</button>
        </div>
      </form>
    </Modal>
  );
};
