import type { TransactionRecord } from './types';

// The transaction log has no reliable type column (every writer leaves `type` at its default),
// so the kind and the payment source are read from the note each writer produces.
// ponytail: note matching breaks if a writer changes its wording; upgrade path is writing
// `type` and a cash flag at insert time and migrating old rows once.
export type TxKind = 'billing' | 'fnb' | 'topup' | 'refund' | 'handover';

// cash = through the drawer; balance = member balance (the cash came in at top up);
// transfer = paid online before arriving (booking), revenue that never touches the drawer
export type TxSource = 'cash' | 'balance' | 'transfer';

export interface TxClass {
  kind: TxKind;
  source: TxSource;
}

// Written by BillingEngine.startSession for a booking already paid online
export const TRANSFER_NOTE = 'Lunas transfer online';

export function classifyTransaction(note: string, price: number): TxClass {
  const n = (note || '').toLowerCase();
  if (n.includes('handover')) return { kind: 'handover', source: 'balance' };
  const source: TxSource = n.includes(TRANSFER_NOTE.toLowerCase())
    ? 'transfer'
    : n.includes('potong saldo') || n.includes('pemakaian saldo') || n.includes('kredit saldo member') ? 'balance' : 'cash';
  if (price < 0 || n.startsWith('refund') || n.startsWith('batal antrian')) return { kind: 'refund', source };
  if (n.includes('f&b')) return { kind: 'fnb', source };
  if (n.includes('top up saldo')) return { kind: 'topup', source };
  return { kind: 'billing', source };
}

export const TX_SOURCE_LABEL: Record<TxSource, string> = {
  cash: 'Tunai',
  balance: 'Saldo member',
  transfer: 'Transfer',
};

export const TX_KIND_LABEL: Record<TxKind, string> = {
  billing: 'Billing PC',
  fnb: 'F&B',
  topup: 'Top up member',
  refund: 'Refund',
  handover: 'Serah terima shift',
};

// Rows store `date` as id-ID locale ("27/9/2026") and `time` as "HH:MM:SS", both local time.
export function txTimestamp(date: string, time = '00:00:00'): number | null {
  const d = (date || '').split('/').map(Number);
  if (d.length !== 3 || d.some(Number.isNaN)) return null;
  const t = (time || '').split(/[:.]/).map(Number);
  return new Date(d[2], d[1] - 1, d[0], t[0] || 0, t[1] || 0, t[2] || 0).getTime();
}

// "YYYY-MM-DD" from <input type="date"> to local midnight.
export function isoDayStart(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// Signed, unlike PcCard's rupiah(): refunds must show as minus.
export const formatRp = (n: number) => `${n < 0 ? '-' : ''}Rp ${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;

export interface CashSummary {
  billing: number;
  fnb: number;
  topup: number;
  cashIn: number;
  cashOut: number;
  net: number;
  // paid from member balance: already counted as cash when the member topped up
  fromBalance: number;
  // paid online before arriving: revenue, but not in the drawer
  transfer: number;
  count: number;
}

export function summarizeCash(rows: Pick<TransactionRecord, 'note' | 'price'>[]): CashSummary {
  const s: CashSummary = { billing: 0, fnb: 0, topup: 0, cashIn: 0, cashOut: 0, net: 0, fromBalance: 0, transfer: 0, count: 0 };
  for (const r of rows) {
    const price = Number(r.price) || 0;
    const c = classifyTransaction(r.note, price);
    if (c.kind === 'handover') continue;
    s.count++;
    if (c.source === 'transfer') {
      s.transfer += price;
      continue;
    }
    if (c.source === 'balance') {
      if (price > 0) s.fromBalance += price;
      continue;
    }
    if (price < 0) {
      s.cashOut += -price;
      continue;
    }
    s.cashIn += price;
    if (c.kind === 'fnb') s.fnb += price;
    else if (c.kind === 'topup') s.topup += price;
    else s.billing += price;
  }
  s.net = s.cashIn - s.cashOut;
  return s;
}
