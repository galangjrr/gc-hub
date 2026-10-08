import React, { useState } from 'react';
import { Workstation } from '../../shared/types';
import { ConfirmModal, ConfirmModalProps } from '../../shared/ui/ConfirmModal';
import { Switch } from '../../shared/ui/primitives';
import { EXE_MODES, EXE_MODE_LABEL } from '../../shared/exePolicy';
import { CardStatus, cardStatus, footText, hhmm, rupiah, timeLine } from './PcCard';
import { Modal, Field, INPUT, BTN_PRIMARY, BTN_SECONDARY } from '../../shared/ui/primitives';
import { pcNameError } from '../../shared/pcName';
import {
  X,
  Pin,
  PinOff,
  Monitor,
  Package,
  UserCheck,
  LogOut,
  Unlock,
  Volume2,
  Camera,
  MessageSquare,
  Power,
  RotateCcw,
  Zap,
  Receipt,
  Cpu,
  Trash2,
  Hamburger,
  Banknote,
  ChevronRight,
  PencilLine,
} from 'lucide-react';

// Right-hand inspector for the selected PC. Colors and status words follow DESIGN.md sections 2, 4 and 5.

interface InspectorDrawerProps {
  pc: Workstation | null;
  isOpen: boolean;
  isPinned: boolean;
  onClose: () => void;
  onTogglePin: () => void;
  onAction: (action: string, pc: Workstation, payload?: any) => void;
  onOpenBuyPackageModal: (pc: Workstation) => void;
  onOpenVolumeModal: (pc: Workstation) => void;
  onOpenScreenshotModal: (pc: Workstation) => void;
  onOpenVncModal: (pc: Workstation) => void;
  onOpenChatModal: (pc: Workstation) => void;
  onOpenOrderModal: (pc: Workstation) => void;
  onOpenTaskManagerModal?: (pc: Workstation) => void;
  /** Admin only; the booth must be online and free. Resolves with the server's answer. */
  onRenamePc?: (pc: Workstation, name: string) => Promise<{ success: boolean; message: string }>;
}

const RenamePcModal: React.FC<{ pc: Workstation; onRename: (name: string) => Promise<{ success: boolean; message: string }>; onClose: () => void }> = ({ pc, onRename, onClose }) => {
  const [name, setName] = useState(pc.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    const nameError = pcNameError(clean) || (clean === pc.name ? 'Nama baru sama dengan nama sekarang.' : null);
    if (nameError) return setError(nameError);
    setSaving(true);
    setError(null);
    const res = await onRename(clean).catch((err: any) => ({ success: false, message: err?.message || 'Server tidak menjawab.' }));
    setSaving(false);
    if (res.success) onClose();
    else setError(res.message);
  };

  return (
    <Modal title={`Ganti Nama ${pc.name}`} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-4">
        <Field label="Nama baru" htmlFor="rename-pc" hint="Dipakai di denah, laporan, dan web booking. PC harus menyala dan sedang kosong." error={error || undefined}>
          <input id="rename-pc" className={INPUT} value={name} maxLength={24} autoFocus disabled={saving}
            onChange={e => { setName(e.target.value); setError(null); }} aria-invalid={!!error} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Batal</button>
          <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? 'Menunggu PC...' : 'Ganti Nama'}</button>
        </div>
      </form>
    </Modal>
  );
};

const STATUS: Record<CardStatus, { label: string; token: string }> = {
  main:   { label: 'Sesi berjalan',     token: '--gc-primary' },
  low:    { label: 'Sisa hampir habis', token: '--gc-warning' },
  unpaid: { label: 'Belum bayar',       token: '--gc-warning' },
  locked: { label: 'Terkunci',          token: '--gc-error' },
  idle:   { label: 'Tersedia',          token: '--gc-text-muted' },
  off:    { label: 'Mati',              token: '--gc-text-disabled' },
};

type ConfirmKind = 'logout' | 'restart' | 'shutdown' | 'delete_pc' | 'kiosk_off';

const confirmCopy = (kind: ConfirmKind, pc: Workstation): Omit<ConfirmModalProps, 'isOpen' | 'onConfirm' | 'onClose'> => {
  switch (kind) {
    case 'logout':
      return {
        title: 'Akhiri Sesi',
        description: `Akhiri sesi ${pc.username || 'tamu'} di ${pc.name}?`,
        detail: 'Waktu berhenti dan PC kembali ke layar kunci. Tagihan personal yang belum dibayar pindah ke status belum bayar.',
        iconType: 'logout', confirmText: 'Akhiri Sesi', confirmVariant: 'danger',
      };
    case 'restart':
      return {
        title: 'Restart PC',
        description: `Restart ${pc.name} sekarang?`,
        detail: 'Aplikasi yang terbuka di PC ini akan tertutup tanpa disimpan.',
        iconType: 'warning', confirmText: 'Restart', confirmVariant: 'warning',
      };
    case 'shutdown':
      return {
        title: 'Matikan PC',
        description: `Matikan ${pc.name} sekarang?`,
        detail: 'Aplikasi yang terbuka di PC ini akan tertutup tanpa disimpan.',
        iconType: 'danger', confirmText: 'Matikan', confirmVariant: 'danger',
      };
    case 'kiosk_off':
      return {
        title: 'Matikan Mode Kiosk',
        description: `Lepas semua pembatasan Windows di ${pc.name}?`,
        detail: 'Task Manager, Run, Control Panel, dan Regedit terbuka, dan aplikasi bilik boleh ditutup. Tetap mati setelah restart sampai dinyalakan lagi.',
        iconType: 'warning', confirmText: 'Matikan Kiosk', confirmVariant: 'warning',
      };
    case 'delete_pc':
      return {
        title: 'Hapus Workstation',
        description: `Yakin ingin menghapus workstation ${pc.name} dari server?`,
        detail: 'Semua riwayat pemakaian dan konfigurasi workstation ini akan dihapus.',
        iconType: 'danger', confirmText: 'Hapus Workstation', confirmVariant: 'danger',
      };
  }
};

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[11px] uppercase tracking-[0.06em] font-semibold text-text-muted mb-1.5">{children}</h3>
);

const Row: React.FC<{ label: string; value: React.ReactNode; numeric?: boolean; className?: string }> = ({ label, value, numeric, className }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-hairline last:border-b-0 text-[13px]">
    <dt className="text-text-muted flex-none">{label}</dt>
    <dd className={`min-w-0 truncate text-right ${numeric ? 'font-mono tabular' : ''} ${className || 'text-text-primary'}`}>{value}</dd>
  </div>
);

const TONE = {
  primary: 'bg-primary text-on-primary border-primary hover:bg-primary-hover',
  default: 'bg-surface-2 text-text-secondary border-hairline hover:bg-surface-3 hover:text-text-primary hover:border-hairline-strong',
  warning: 'bg-surface-2 text-warning border-warning/40 hover:bg-warning/10',
  danger:  'bg-surface-2 text-error border-error/40 hover:bg-error/10',
};

const Action: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: keyof typeof TONE;
  wide?: boolean;
}> = ({ icon: Icon, label, onClick, tone = 'default', wide }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-8 px-2.5 flex items-center gap-2 rounded-sm border text-[12px] font-medium transition-colors duration-150 ease-out active:translate-y-px ${FOCUS} ${TONE[tone]} ${wide ? 'col-span-2' : ''}`}
  >
    <Icon className="w-3.5 h-3.5 flex-none" aria-hidden />
    <span className="truncate">{label}</span>
  </button>
);

// Callout for things waiting on the cashier (unpaid bill, F&B order). Whole row is the button.
const Callout: React.FC<{ icon: React.FC<{ className?: string }>; title: string; detail: string; onClick: () => void }> = ({ icon: Icon, title, detail, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-sm border border-warning/50 bg-warning/10 text-left transition-colors duration-150 hover:bg-warning/20 ${FOCUS}`}
  >
    <Icon className="w-4 h-4 flex-none text-warning" aria-hidden />
    <span className="flex-1 min-w-0">
      <span className="block text-[13px] font-semibold text-text-primary">{title}</span>
      <span className="block text-[12px] text-text-secondary tabular truncate">{detail}</span>
    </span>
    <ChevronRight className="w-4 h-4 flex-none text-warning" aria-hidden />
  </button>
);

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  pc,
  isOpen,
  isPinned,
  onClose,
  onTogglePin,
  onAction,
  onOpenBuyPackageModal,
  onOpenVolumeModal,
  onOpenScreenshotModal,
  onOpenVncModal,
  onOpenChatModal,
  onOpenOrderModal,
  onOpenTaskManagerModal,
  onRenamePc,
}) => {
  // Hook stays above the early return, otherwise closing and reopening the drawer breaks hook order
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [renaming, setRenaming] = useState(false);

  if (!pc || !isOpen) return null;

  const status = cardStatus(pc);
  const statusInfo = STATUS[status];
  const isActive = pc.state === 'active_guest' || pc.state === 'active_member';
  const isUnpaid = pc.state === 'unpaid' || !!pc.isUnpaid;
  const isLocked = pc.state === 'locked';
  const isFree = pc.state === 'idle' || pc.state === 'offline';
  const hasSession = isActive || isUnpaid || isLocked;
  const isPostpaid = pc.billingType === 'postpaid';
  const time = hasSession ? timeLine(pc) : null;
  const orders = pc.pendingOrderCount || (pc.hasPendingOrder ? 1 : 0);
  const unpaidAmount = pc.unpaidAmount ?? pc.moneyUsed ?? 0;

  const pcCost = isPostpaid && pc.personalBill ? pc.personalBill.total : (pc.moneyUsed || 0);
  const remainingSeconds = pc.remainingSeconds ?? (pc.timeRemainingMinutes !== undefined ? pc.timeRemainingMinutes * 60 : undefined);
  // Same rule as BillingEngine.refundSession: only paid prepaid sessions have cash to give back.
  const canRefund = isActive && !isPostpaid && pc.billingType !== 'member' && (pc.moneyUsed || 0) > 0 && (remainingSeconds ?? 0) > 0;

  // Switch works only on a connected PC whose gc-agent has reported its state
  const kioskKnown = pc.state !== 'offline' && !pc.isDisconnected && pc.kioskEnabled !== undefined;
  const kioskNote = pc.state === 'offline' || pc.isDisconnected
    ? 'PC tidak tersambung'
    : pc.kioskEnabled === undefined
      ? 'gc-agent belum terpasang'
      : pc.kioskEnabled ? 'Nyala, Windows dibatasi' : 'Mati, Windows bebas dipakai';

  const simulate = (minutes: number) => (window as any).electronAPI?.simulateSessionElapsed?.(pc.name, minutes);

  return (
    <aside
      aria-label={`Inspektor ${pc.name}`}
      className="flex-none flex flex-col w-[280px] bg-surface-1 border-l border-hairline overflow-hidden"
    >
      <header className="flex items-start gap-2 px-3 py-2.5 border-b border-hairline flex-none">
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary truncate" title={pc.name}>{pc.name}</h2>
          <div className="text-[11px] font-mono text-text-muted truncate">
            {pc.ip || 'IP belum diketahui'}{pc.mac && !/^[0:-]+$/.test(pc.mac) ? ` · ${pc.mac}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={isPinned}
          aria-label={isPinned ? 'Lepas sematan inspektor' : 'Sematkan inspektor'}
          title={isPinned ? 'Lepas sematan' : 'Sematkan'}
          className={`w-8 h-8 flex items-center justify-center rounded-sm transition-colors duration-150 ${FOCUS} ${isPinned ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-primary hover:bg-surface-3'}`}
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" aria-hidden /> : <Pin className="w-3.5 h-3.5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup inspektor"
          title="Tutup"
          className={`w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors duration-150 ${FOCUS}`}
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
        {/* Status: same color language as the PC card */}
        <div
          className="flex items-center gap-2 h-8 px-2.5 rounded-sm text-[12px] font-semibold"
          style={{ background: `rgb(var(${statusInfo.token}) / 0.12)`, color: `rgb(var(${statusInfo.token}))` }}
        >
          <span className="w-[7px] h-[7px] rounded-full flex-none" style={{ background: pc.isDisconnected && hasSession ? 'rgb(var(--gc-error))' : 'currentColor' }} aria-hidden />
          <span className="flex-1 truncate">
            {statusInfo.label}{pc.isDisconnected && hasSession ? ', klien terputus' : ''}
          </span>
          <span className="text-[11px] font-medium text-text-muted truncate">{pc.groupName || 'Reguler'}</span>
        </div>

        {(isUnpaid || orders > 0) && (
          <div className="space-y-2">
            {isUnpaid && (
              <Callout icon={Receipt} title="Tagihan belum dibayar" detail={`${rupiah(unpaidAmount)}, klik untuk selesaikan`} onClick={() => onAction('settle_unpaid', pc)} />
            )}
            {orders > 0 && (
              <Callout
                icon={Hamburger}
                title={`${orders} pesanan F&B menunggu`}
                detail={pc.pendingOrderSummary || 'Klik untuk konfirmasi dan cetak'}
                onClick={() => onOpenOrderModal(pc)}
              />
            )}
          </div>
        )}

        {hasSession && (
          <section>
            <SectionLabel>Sesi</SectionLabel>
            {time && (
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className={`font-mono tabular text-[28px] font-semibold tracking-[-0.02em] ${status === 'low' ? 'text-warning' : 'text-text-primary'}`}>
                  {time.value}
                </span>
                <span className="text-[12px] text-text-muted">{time.label}</span>
              </div>
            )}
            <dl>
              <Row label="Pengguna" value={pc.username || 'Tamu'} />
              <Row label={isPostpaid ? 'Tarif' : 'Paket'} value={isPostpaid ? (pc.personalRate?.name || 'Personal') : footText(pc, status)} />
              <Row label="Terpakai" value={hhmm((pc.timeUsedMinutes || 0) * 60)} numeric />
              {pc.sessionStartedAt && (
                <Row
                  label="Mulai"
                  value={new Date(pc.sessionStartedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}
                  numeric
                />
              )}
              <Row
                label="Aplikasi aktif"
                value={pc.activeApp || 'Tidak ada data'}
                className={pc.activeApp ? 'text-warning font-medium' : 'text-text-disabled'}
              />
            </dl>
          </section>
        )}

        {(isActive || isLocked) && (
          <section>
            <SectionLabel>Tagihan</SectionLabel>
            <dl>
              <Row label="Pemakaian PC" value={rupiah(pcCost)} numeric />
            </dl>
            <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-hairline-strong">
              <span className="text-[13px] font-semibold text-text-primary">Total</span>
              <span className="font-mono tabular text-[15px] font-semibold text-text-primary">{rupiah(pcCost)}</span>
            </div>
            {isPostpaid && pc.personalBill && (
              <p className="mt-1 text-[12px] text-text-muted tabular">
                Naik ke {rupiah(pc.personalBill.nextTotal)} dalam {Math.ceil(pc.personalBill.secondsToNext / 60)} menit
              </p>
            )}
          </section>
        )}

        <section>
          <SectionLabel>Billing</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {isFree && (
              <>
                <Action icon={UserCheck} label="Buka Personal" tone="primary" onClick={() => onAction('login_guest_open', pc)} />
                <Action icon={Package} label="Beli Paket" tone="primary" onClick={() => onOpenBuyPackageModal(pc)} />
                {pc.state === 'offline' && <Action icon={Power} label="Nyalakan PC" wide onClick={() => onAction('wake_on_lan', pc)} />}
              </>
            )}
            {isActive && (
              <>
                {!isPostpaid && <Action icon={Package} label="Paket" tone="primary" onClick={() => onOpenBuyPackageModal(pc)} />}
                <Action icon={LogOut} label="Akhiri Sesi" tone="danger" wide={isPostpaid} onClick={() => setConfirm('logout')} />
                {canRefund && <Action icon={Banknote} label="Refund Sisa" tone="warning" wide onClick={() => onAction('open_refund', pc)} />}
              </>
            )}
            {isLocked && (
              <>
                <Action icon={Unlock} label="Buka Kunci" tone="primary" onClick={() => onAction('unlock', pc)} />
                <Action icon={LogOut} label="Akhiri Sesi" tone="danger" onClick={() => setConfirm('logout')} />
              </>
            )}
            {isUnpaid && !isActive && (
              <Action icon={Receipt} label="Selesaikan Tagihan" tone="primary" wide onClick={() => onAction('settle_unpaid', pc)} />
            )}
          </div>
        </section>

        <section>
          <SectionLabel>Kontrol PC</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {onOpenTaskManagerModal && <Action icon={Cpu} label="Proses App" onClick={() => onOpenTaskManagerModal(pc)} />}
            <Action icon={MessageSquare} label="Kirim Chat" onClick={() => onOpenChatModal(pc)} />
            <Action icon={Camera} label="Screenshot" onClick={() => onOpenScreenshotModal(pc)} />
            <Action icon={Monitor} label="Remote VNC" onClick={() => onOpenVncModal(pc)} />
            <Action icon={Volume2} label="Volume" onClick={() => onOpenVolumeModal(pc)} />
            <Action icon={RotateCcw} label="Restart" tone="warning" onClick={() => setConfirm('restart')} />
            <Action icon={Power} label="Matikan" tone="danger" onClick={() => setConfirm('shutdown')} />
          </div>
          <div className="flex items-center gap-3 mt-2 px-2.5 py-2 rounded-sm border border-hairline bg-surface-2">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-text-primary">Mode Kiosk</div>
              <div className={`text-[12px] truncate ${pc.kioskEnabled === false ? 'text-warning' : 'text-text-muted'}`}>
                {kioskNote}
              </div>
            </div>
            <Switch
              checked={pc.kioskEnabled !== false}
              disabled={!kioskKnown}
              onChange={(on) => (on ? onAction('kiosk', pc, true) : setConfirm('kiosk_off'))}
              label={`Mode Kiosk ${pc.name}`}
            />
          </div>
          <div className="flex items-center gap-3 mt-2 px-2.5 py-2 rounded-sm border border-hairline bg-surface-2">
            <div className="flex-1 min-w-0">
              <label htmlFor={`exe-mode-${pc.id}`} className="block text-[13px] font-medium text-text-primary">Allowlist aplikasi</label>
              <div className={`text-[12px] truncate ${pc.exeMode === 'enforce' ? 'text-primary' : 'text-text-muted'}`}>
                {pc.exeMode ? `Di PC: ${EXE_MODE_LABEL[pc.exeMode]}` : 'Belum ada laporan dari PC'}
              </div>
            </div>
            <select
              id={`exe-mode-${pc.id}`}
              value={pc.exeOverride ?? 'default'}
              onChange={e => onAction('exe_mode', pc, e.target.value === 'default' ? null : e.target.value)}
              className={`h-8 px-2 rounded-sm bg-surface-3 border border-hairline text-[12px] text-text-primary ${FOCUS}`}
            >
              <option value="default">Ikut default</option>
              {EXE_MODES.map(m => <option key={m} value={m}>{EXE_MODE_LABEL[m]}</option>)}
            </select>
          </div>
        </section>

        {pc.historyEvents && pc.historyEvents.length > 0 && (
          <section>
            <SectionLabel>Riwayat</SectionLabel>
            <ol className="space-y-1">
              {pc.historyEvents.slice(0, 5).map((ev, i) => (
                <li key={i} className="text-[12px] font-mono text-text-muted truncate" title={ev}>{ev}</li>
              ))}
            </ol>
          </section>
        )}

        {import.meta.env.DEV && isActive && (
          <section className="p-2 rounded-sm border border-dashed border-hairline-strong">
            <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] font-semibold text-text-muted mb-1.5">
              <Zap className="w-3 h-3" aria-hidden />
              Simulator dev
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              <Action icon={Zap} label="Terpakai 48m" onClick={() => simulate(48)} />
              <Action icon={Zap} label="Terpakai 30m" onClick={() => simulate(30)} />
            </div>
          </section>
        )}

        <div className="pt-2 border-t border-hairline flex flex-col items-start">
          {onRenamePc && (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className={`h-8 px-2 flex items-center gap-2 rounded-sm text-[12px] font-medium text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors duration-150 ${FOCUS}`}
            >
              <PencilLine className="w-3.5 h-3.5" aria-hidden />
              Ganti nama PC
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirm('delete_pc')}
            className={`h-8 px-2 flex items-center gap-2 rounded-sm text-[12px] font-medium text-text-muted hover:text-error hover:bg-error/10 transition-colors duration-150 ${FOCUS}`}
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
            Hapus PC dari server
          </button>
        </div>
      </div>

      {renaming && onRenamePc && (
        <RenamePcModal pc={pc} onRename={name => onRenamePc(pc, name)} onClose={() => setRenaming(false)} />
      )}

      {confirm && (
        <ConfirmModal
          isOpen
          {...confirmCopy(confirm, pc)}
          onConfirm={() => (confirm === 'kiosk_off' ? onAction('kiosk', pc, false) : onAction(confirm, pc))}
          onClose={() => setConfirm(null)}
        />
      )}
    </aside>
  );
};
