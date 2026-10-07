import React, { useRef } from 'react';
import { Hamburger, Hourglass, Layers, MessageSquare, Monitor, Receipt, UserRound, X, ChevronDown } from 'lucide-react';
import { Workstation } from '../../shared/types';

// PC card anatomy and colors follow DESIGN.md section 5 (Kartu PC).
export type CardStatus = 'main' | 'low' | 'unpaid' | 'locked' | 'idle' | 'off';

const LOW_TIME_SECONDS = 5 * 60;

const isAdminSession = (pc: Workstation) => pc.userType === 'admin';

export function cardStatus(pc: Workstation): CardStatus {
  if (pc.state === 'unpaid') return 'unpaid';
  if (pc.state === 'locked') return 'locked';
  if (pc.state === 'idle') return 'idle';
  if (pc.state === 'offline') return 'off';
  const remaining = pc.remainingSeconds;
  if (pc.billingType !== 'postpaid' && remaining !== undefined && remaining <= LOW_TIME_SECONDS) return 'low';
  return 'main';
}

export const hhmm = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds / 60));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const rupiah = (n: number) => `Rp ${Math.max(0, Math.round(n)).toLocaleString('id-ID')}`;

const clock = (epochMs: number) =>
  new Date(epochMs).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');

export function timeLine(pc: Workstation): { value: string; label: string } | null {
  if (isAdminSession(pc)) return { value: hhmm((pc.timeUsedMinutes || 0) * 60), label: 'admin' };
  if (pc.state === 'unpaid') return { value: hhmm((pc.timeUsedMinutes || 0) * 60), label: 'total' };
  if (pc.billingType === 'postpaid' || pc.remainingSeconds === undefined) {
    return { value: hhmm((pc.timeUsedMinutes || 0) * 60), label: 'jalan' };
  }
  return { value: hhmm(pc.remainingSeconds), label: 'sisa' };
}

export function footText(pc: Workstation, status: CardStatus): string {
  if (status === 'idle') return 'Tersedia';
  if (status === 'off') return 'Mati';
  if (status === 'unpaid') return `Belum bayar ${rupiah(pc.unpaidAmount ?? 0)}`;
  if (isAdminSession(pc)) return 'Admin, tanpa biaya';
  if (status === 'locked') return 'Terkunci';
  if (pc.billingType === 'postpaid' && pc.personalBill) {
    return `${rupiah(pc.personalBill.total)} · naik ${Math.ceil(pc.personalBill.secondsToNext / 60)}m`;
  }
  const stacks = pc.stackedPackages || [];
  const active = stacks.find(p => p.status === 'In Use');
  const queued = stacks.filter(p => p.status === 'Not Used').length;
  const name = active?.name || pc.packageName;
  if (name) return queued > 0 ? `${name} +${queued}` : name;
  return rupiah(pc.moneyUsed || 0);
}

const STATUS_WORD: Record<CardStatus, string> = {
  main: 'sesi berjalan', low: 'sisa waktu hampir habis', unpaid: 'belum bayar',
  locked: 'terkunci', idle: 'tersedia', off: 'mati',
};

// Token-based styles so both themes work (see DESIGN.md "Tema Terang dan Gelap").
const tint = (token: string, alpha: number) =>
  `linear-gradient(rgb(var(${token}) / ${alpha}), rgb(var(${token}) / ${alpha}))`;

const STYLES: Record<CardStatus, { card: React.CSSProperties; foot: React.CSSProperties; dot: string }> = {
  main: {
    card: { backgroundColor: 'rgb(var(--gc-surface-2))', backgroundImage: tint('--gc-primary', 0.1), border: '1px solid rgb(var(--gc-primary) / 0.45)' },
    foot: { background: 'rgb(var(--gc-primary) / 0.16)', color: 'rgb(var(--gc-primary))' },
    dot: 'rgb(var(--gc-primary))',
  },
  low: {
    card: { backgroundColor: 'rgb(var(--gc-surface-2))', backgroundImage: tint('--gc-warning', 0.12), border: '1px solid rgb(var(--gc-warning))' },
    foot: { background: 'rgb(var(--gc-warning) / 0.18)', color: 'rgb(var(--gc-warning))' },
    dot: 'rgb(var(--gc-warning))',
  },
  unpaid: {
    card: { background: 'rgb(var(--gc-surface-2))', border: '2px solid rgb(var(--gc-warning))' },
    foot: { background: 'rgb(var(--gc-warning))', color: 'rgb(var(--gc-on-primary))' },
    dot: 'rgb(var(--gc-warning))',
  },
  locked: {
    card: { backgroundColor: 'rgb(var(--gc-surface-2))', backgroundImage: tint('--gc-error', 0.12), border: '1px solid rgb(var(--gc-error) / 0.55)' },
    foot: { background: 'rgb(var(--gc-error) / 0.16)', color: 'rgb(var(--gc-error))' },
    dot: 'rgb(var(--gc-error))',
  },
  idle: {
    card: { background: 'rgb(var(--gc-surface-2))', border: '1px solid rgb(var(--gc-hairline))' },
    foot: { color: 'rgb(var(--gc-text-muted))', borderTop: '1px solid rgb(var(--gc-hairline))' },
    dot: 'rgb(var(--gc-primary) / 0.5)',
  },
  off: {
    card: { background: 'rgb(var(--gc-canvas))', border: '1px dashed rgb(var(--gc-hairline-strong))' },
    foot: { color: 'rgb(var(--gc-text-disabled))', borderTop: '1px solid rgb(var(--gc-hairline))' },
    dot: 'rgb(var(--gc-text-disabled) / 0.6)',
  },
};

interface PcCardProps {
  pc: Workstation;
  isSelected: boolean;
  isDragOver: boolean;
  unreadChats: number;
  isBillingOpen: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleBilling: () => void;
  onCloseBilling: () => void;
  onOpenOrders: () => void;
  onOpenChat: () => void;
  onAddPackage: () => void;
  onRefund: () => void;
  onFinishPersonal: () => void;
  onSettle: () => void;
  dragProps: Pick<React.HTMLAttributes<HTMLDivElement>, 'draggable' | 'onDragStart' | 'onDragOver' | 'onDragLeave' | 'onDrop'>;
}

export const PcCard: React.FC<PcCardProps> = ({
  pc, isSelected, isDragOver, unreadChats, isBillingOpen,
  onSelect, onContextMenu, onToggleBilling, onCloseBilling, onOpenOrders, onOpenChat,
  onAddPackage, onRefund, onFinishPersonal, onSettle, dragProps,
}) => {
  const status = cardStatus(pc);
  const style = STYLES[status];
  const hasSession = status !== 'idle' && status !== 'off';
  const time = hasSession ? timeLine(pc) : null;
  const foot = footText(pc, status);
  const orders = pc.pendingOrderCount || (pc.hasPendingOrder ? 1 : 0);
  const isPostpaid = pc.billingType === 'postpaid' || status === 'unpaid';
  const billingLabel = `${isPostpaid ? 'Lihat tagihan' : 'Lihat paket'} ${pc.name}`;
  const aria = `${pc.name}, ${STATUS_WORD[status]}${time ? `, ${pc.username || 'Tamu'}, ${time.value} ${time.label}` : ''}`;
  const dimTitle = status === 'off';
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Cards on the right half open the popover leftwards so it never runs off screen
  const popoverAlign = (wrapperRef.current?.getBoundingClientRect().left ?? 0) > window.innerWidth / 2 ? 'right' : 'left';

  return (
    <div ref={wrapperRef} className="relative" style={{ zIndex: isBillingOpen ? 20 : undefined }}>
      <div
        data-pc-card="true"
        data-pc-id={pc.id}
        {...dragProps}
        onContextMenu={onContextMenu}
        className="flex flex-col h-[148px] rounded-md overflow-hidden transition-[border-color,background-color,transform] duration-150 ease-out"
        style={{
          ...style.card,
          boxShadow: isSelected ? '0 0 0 2px rgb(var(--gc-primary))' : undefined,
          transform: isDragOver ? 'translateY(-2px)' : undefined,
        }}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={isSelected}
          aria-label={aria}
          title={pc.name}
          className="flex-1 min-h-0 flex flex-col text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <span className="flex items-center gap-1.5 px-3 pt-2.5 w-full">
            <span className={`flex-1 min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] ${dimTitle ? 'text-text-disabled' : 'text-text-primary'}`}>
              {pc.name}
            </span>
            <span
              className="w-[7px] h-[7px] rounded-full flex-none"
              style={{ background: pc.isDisconnected && hasSession ? 'rgb(var(--gc-error))' : style.dot }}
              title={pc.isDisconnected && hasSession ? 'Klien terputus, waktu tetap jalan' : undefined}
            />
          </span>

          {hasSession && time ? (
            <span className="flex-1 min-h-0 flex flex-col gap-[3px] px-3 pt-1.5 w-full">
              <span className="flex items-center gap-1.5 text-[12px] text-text-secondary min-w-0">
                {isPostpaid ? <Receipt className="w-[13px] h-[13px] flex-none" aria-hidden />
                  : pc.userType === 'member' ? <UserRound className="w-[13px] h-[13px] flex-none" aria-hidden />
                  : <Hourglass className="w-[13px] h-[13px] flex-none" aria-hidden />}
                <span className="truncate">{pc.username || 'Tamu'}</span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={`font-mono tabular text-[22px] font-semibold tracking-[-0.02em] ${status === 'low' ? 'text-warning' : 'text-text-primary'}`}>
                  {time.value}
                </span>
                <span className="text-[11px] text-text-muted">{time.label}</span>
              </span>
              <span className="text-[12px] font-medium text-warning truncate min-h-[16px]">{pc.activeApp || ''}</span>
            </span>
          ) : (
            <span className="flex-1 flex items-center justify-center" style={{ color: status === 'off' ? 'rgb(var(--gc-text-disabled) / 0.5)' : 'rgb(var(--gc-text-muted) / 0.7)' }}>
              <Monitor className="w-[30px] h-[30px]" strokeWidth={1.6} aria-hidden />
            </span>
          )}
        </button>

        <div className="h-[30px] flex-none flex items-center gap-1.5 pl-3 pr-2 text-[12px] font-semibold" style={style.foot}>
          {hasSession && !isAdminSession(pc) ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleBilling(); }}
              aria-expanded={isBillingOpen}
              aria-label={`${billingLabel}: ${foot}`}
              title={foot}
              className="flex-1 min-w-0 h-full flex items-center gap-1.5 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              <Layers className="w-[13px] h-[13px] flex-none" aria-hidden />
              <span className="tabular truncate">{foot}</span>
              <ChevronDown className={`w-3 h-3 flex-none transition-transform ${isBillingOpen ? 'rotate-180 opacity-100' : 'opacity-60'}`} aria-hidden />
            </button>
          ) : (
            <span className="flex-1 min-w-0 tabular truncate">{foot}</span>
          )}

          {orders > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenOrders(); }}
              aria-label={`${orders} pesanan F&B menunggu di ${pc.name}`}
              title={pc.pendingOrderSummary || 'Pesanan F&B'}
              className="inline-flex items-center gap-[3px] h-5 px-1.5 rounded-xs text-[11px] font-semibold bg-warning text-on-primary cursor-pointer"
            >
              <Hamburger className="w-3 h-3" aria-hidden />
              <span className="font-mono">{orders}</span>
            </button>
          )}
          {unreadChats > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenChat(); }}
              aria-label={`${unreadChats} pesan belum dibaca dari ${pc.name}`}
              className="inline-flex items-center gap-[3px] h-5 px-1.5 rounded-xs text-[11px] font-semibold bg-primary text-on-primary cursor-pointer"
            >
              <MessageSquare className="w-3 h-3" aria-hidden />
              <span className="font-mono">{unreadChats}</span>
            </button>
          )}
        </div>
      </div>

      {isBillingOpen && (
        <BillingPopover
          pc={pc}
          align={popoverAlign}
          onClose={onCloseBilling}
          onAddPackage={onAddPackage}
          onRefund={onRefund}
          onFinishPersonal={onFinishPersonal}
          onSettle={onSettle}
        />
      )}
    </div>
  );
};

const STACK_STATUS: Record<string, { text: string; className: string; row?: string }> = {
  'In Use': { text: 'Dipakai', className: 'bg-primary/15 text-primary' },
  'Not Used': { text: 'Antre', className: 'bg-surface-3 text-text-secondary border border-hairline-strong' },
  Used: { text: 'Selesai', className: 'text-text-disabled', row: 'text-text-disabled line-through' },
};

interface BillingPopoverProps {
  pc: Workstation;
  align: 'left' | 'right';
  onClose: () => void;
  onAddPackage: () => void;
  onRefund: () => void;
  onFinishPersonal: () => void;
  onSettle: () => void;
}

const BillingPopover: React.FC<BillingPopoverProps> = ({ pc, align, onClose, onAddPackage, onRefund, onFinishPersonal, onSettle }) => {
  const isUnpaid = pc.state === 'unpaid';
  const isPostpaid = pc.billingType === 'postpaid' || isUnpaid;
  const stacks = pc.stackedPackages || [];
  const queued = stacks.filter(p => p.status === 'Not Used').length;
  const rate = pc.personalRate;
  const bill = pc.personalBill;
  const title = `${isPostpaid ? 'Tagihan' : 'Paket'} ${pc.name}`;

  const facts: Array<{ k: string; v: string }> = isPostpaid
    ? [
        { k: rate?.name ? `Tarif ${rate.name}` : 'Tarif', v: rate ? `${rupiah(rate.firstHourPrice)} + ${rupiah(rate.nextHoursPrice)}/jam` : `${rupiah(pc.sessionPricePerHour || pc.pricePerHour || 0)}/jam` },
        ...(rate ? [{ k: 'Akumulasi', v: rate.accumulationMinutes === 60 ? 'Per jam, ditagih penuh' : `Tiap ${rate.accumulationMinutes} menit` }] : []),
        ...(pc.sessionStartedAt ? [{ k: 'Mulai', v: clock(pc.sessionStartedAt) }] : []),
        { k: isUnpaid ? 'Durasi' : 'Jalan', v: hhmm((pc.timeUsedMinutes || 0) * 60) },
        ...(!isUnpaid && bill ? [{ k: `Pukul ${clock(Date.now() + bill.secondsToNext * 1000)} jadi`, v: rupiah(bill.nextTotal) }] : []),
      ]
    : [];

  const total = isUnpaid
    ? pc.unpaidAmount ?? 0
    : isPostpaid
      ? bill?.total ?? pc.moneyUsed ?? 0
      : stacks.length > 0 ? stacks.reduce((sum, p) => sum + (p.price || 0), 0) : pc.moneyUsed || 0;

  return (
    <div
      role="dialog"
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      className={`absolute top-[154px] ${align === 'right' ? 'right-0' : 'left-0'} w-[min(640px,calc(100vw-48px))] p-3.5 flex flex-col gap-3 rounded-md bg-surface-2 border border-hairline-strong shadow-modal text-text-primary`}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold truncate">{title}</div>
          <div className="text-[12px] text-text-muted truncate">
            {pc.username || 'Tamu'} · {isPostpaid ? 'personal, tiap blok yang dimulai ditagih penuh' : `${stacks.length || 1} paket, ${queued} antre`}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup" autoFocus className="w-8 h-8 inline-flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-3 hover:text-text-primary">
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>

      {isPostpaid ? (
        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
          {facts.map(f => (
            <div key={f.k} className="flex flex-col gap-0.5 min-w-0">
              <dt className="text-[11px] font-semibold tracking-[0.04em] uppercase text-text-muted truncate">{f.k}</dt>
              <dd className="m-0 font-mono tabular text-[13px] font-semibold">{f.v}</dd>
            </div>
          ))}
        </dl>
      ) : stacks.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-[11px] font-semibold tracking-[0.04em] uppercase text-text-muted text-left">
                <th className="pb-2 pr-2.5 font-semibold">Paket</th>
                <th className="pb-2 px-2.5 font-semibold">Durasi</th>
                <th className="pb-2 px-2.5 font-semibold text-right">Harga</th>
                <th className="pb-2 px-2.5 font-semibold">Dibeli</th>
                <th className="pb-2 px-2.5 font-semibold">Kedaluwarsa</th>
                <th className="pb-2 pl-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {stacks.map(p => {
                const st = STACK_STATUS[p.status] || STACK_STATUS['Not Used'];
                return (
                  <tr key={p.id} className={`border-t border-hairline whitespace-nowrap ${st.row || ''}`}>
                    <td className="py-2 pr-2.5 font-semibold">{p.name}</td>
                    <td className="py-2 px-2.5 font-mono">{p.minutesFormatted}</td>
                    <td className="py-2 px-2.5 font-mono text-right">{rupiah(p.price)}</td>
                    <td className="py-2 px-2.5 font-mono text-text-muted">{p.purchasedAt}</td>
                    <td className="py-2 px-2.5 font-mono text-text-muted">{p.expiredAt}</td>
                    <td className="py-2 pl-2.5">
                      <span className={`inline-flex items-center h-5 px-1.5 rounded-xs text-[11px] font-semibold ${st.className}`}>
                        {p.status === 'In Use' && pc.remainingSeconds !== undefined
                          ? `${st.text}, sisa ${hhmm(Math.max(0, pc.remainingSeconds - stacks.filter(q => q.status === 'Not Used').reduce((s, q) => s + q.minutes * 60, 0)))}`
                          : st.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 text-[12px] text-text-secondary">
          {pc.packageName ? `Paket ${pc.packageName}.` : 'Belum ada rincian paket.'} Sisa {hhmm(pc.remainingSeconds || 0)}.
        </p>
      )}

      <div className="flex items-center gap-2 pt-2.5 border-t border-hairline">
        <span className="text-[12px] text-text-muted">{isUnpaid ? 'Harus dibayar' : 'Total'}</span>
        <span className="flex-1 font-mono tabular text-[14px] font-semibold">{rupiah(total)}</span>
        {isUnpaid ? (
          <button type="button" onClick={onSettle} className="h-8 px-3 rounded-sm bg-warning text-on-primary text-[13px] font-semibold active:translate-y-px">
            Bayar
          </button>
        ) : isPostpaid ? (
          <button type="button" onClick={onFinishPersonal} className="h-8 px-3 rounded-sm bg-primary text-on-primary text-[13px] font-semibold active:translate-y-px">
            Selesai main
          </button>
        ) : (
          <>
            {queued > 0 && (
              <button type="button" onClick={onRefund} className="h-8 px-3 rounded-sm border border-hairline text-text-secondary text-[13px] font-medium hover:bg-surface-3 active:translate-y-px">
                Refund paket antre
              </button>
            )}
            <button type="button" onClick={onAddPackage} className="h-8 px-3 rounded-sm bg-primary text-on-primary text-[13px] font-semibold active:translate-y-px">
              Tambah paket
            </button>
          </>
        )}
      </div>
    </div>
  );
};
