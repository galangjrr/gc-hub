import React, { useState, useEffect, useRef } from 'react';
import { Banknote } from 'lucide-react';
import { Workstation } from '../../../shared/types';
import { normalizeRoundingStep, roundDownToStep, RoundingStep } from '../../../shared/personalBilling';
import { Modal, INPUT, BTN_SECONDARY, FOCUS } from '../../../shared/ui/primitives';
import { rupiah } from '../PcCard';

export interface RefundModalProps {
  isOpen: boolean;
  pc: Workstation | null;
  onClose: () => void;
  onConfirmRefund: (
    pc: Workstation,
    payload: {
      reason: string;
      refundToBalance: boolean;
      customAmount: number;
      penaltyPercent: number;
      refundMode?: 'full' | 'queued_only';
    }
  ) => void;
}

const REASON_PRESETS = [
  { id: 'user_cancel', label: 'Permintaan Pelanggan Pulang Awal', isZeroPenalty: false },
  { id: 'pc_full', label: 'Bilik Pengganti Penuh Saat Kendala PC', isZeroPenalty: true },
  { id: 'closing_maintenance', label: 'Tutup Operasional atau Maintenance Server', isZeroPenalty: true },
];

export const RefundModal: React.FC<RefundModalProps> = ({
  isOpen,
  pc,
  onClose,
  onConfirmRefund,
}) => {
  const [configuredPenalty, setConfiguredPenalty] = useState<number>(50);
  const [roundingStep, setRoundingStep] = useState<RoundingStep>(100);
  const [selectedReason, setSelectedReason] = useState<string>('Permintaan Pelanggan Pulang Awal');
  const [customNote, setCustomNote] = useState<string>('');
  const [refundToBalance, setRefundToBalance] = useState<boolean>(false);
  const [refundMode, setRefundMode] = useState<'full' | 'queued_only'>('full');

  const lastPcIdRef = useRef<number | null>(null);

  // Muat konfigurasi penalti global dari database server
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getSetting) {
      api.getSetting('cashierRoundingStep').then((val: string) => setRoundingStep(normalizeRoundingStep(val)));
      api.getSetting('refundPenaltyPercent').then((val: string) => {
        if (val) {
          const num = Number(val);
          if (!isNaN(num)) setConfiguredPenalty(num);
        }
      });
    }
  }, []);

  // Reset state hanya saat bilik PC pertama kali dibuka
  useEffect(() => {
    if (!isOpen || !pc) {
      lastPcIdRef.current = null;
      return;
    }
    if (lastPcIdRef.current !== pc.id) {
      lastPcIdRef.current = pc.id;
      setSelectedReason('Permintaan Pelanggan Pulang Awal');
      setCustomNote('');
      setRefundToBalance(false);
      setRefundMode('full');
    }
  }, [isOpen, pc?.id]);

  if (!isOpen || !pc) return null;

  const isMember = pc.userType === 'member';

  // Analisis paket bertumpuk (In Use vs Not Used)
  const stacked = pc.stackedPackages || [];
  const queuedPackages = stacked.filter(p => p.status === 'Not Used');
  const activeStackPackage = stacked.find(p => p.status === 'In Use');
  const hasQueued = queuedPackages.length > 0;
  const queuedTotalPrice = queuedPackages.reduce((sum, p) => sum + (p.price || 0), 0);
  const queuedTotalMinutes = queuedPackages.reduce((sum, p) => sum + (p.minutes || 0), 0);

  // Perhitungan waktu
  const totalRemainingMin = Math.max(0, pc.timeRemainingMinutes !== undefined 
    ? pc.timeRemainingMinutes 
    : Math.ceil((pc.remainingSeconds || 0) / 60));

  // Sisa waktu paket yang sedang in_use (total sisa dikurangi antrian)
  const activeRemainingMin = hasQueued 
    ? Math.max(0, totalRemainingMin - queuedTotalMinutes)
    : totalRemainingMin;

  const timeUsedMin = Math.max(0, pc.timeUsedMinutes || 0);
  const activeTotalMin = Math.max(1, timeUsedMin + activeRemainingMin);

  // Harga dasar paket yang sedang aktif berjalan
  // Harga yang benar-benar dibayar untuk paket aktif. Tidak diketahui = 0, jangan ditebak:
  // angka ini dikirim ke engine sebagai uang tunai yang dikembalikan.
  const activeBasePrice = activeStackPackage?.price && activeStackPackage.price > 0
    ? activeStackPackage.price
    : pc.packagePrice && pc.packagePrice > 0
      ? (hasQueued ? Math.max(0, pc.packagePrice - queuedTotalPrice) : pc.packagePrice)
      : 0;

  // Persentase penalti otomatis (0% jika kendala warnet, atau configuredPenalty jika pulang awal)
  const currentReasonObj = REASON_PRESETS.find(p => p.label === selectedReason);
  const penaltyPercent = currentReasonObj?.isZeroPenalty ? 0 : configuredPenalty;

  // 1. Kalkulasi paket aktif (pro-rata sisa waktu)
  const rawActiveUnused = activeTotalMin > 0 
    ? Math.round((activeRemainingMin / activeTotalMin) * activeBasePrice)
    : 0;
  const penaltyDeduction = Math.round(rawActiveUnused * (penaltyPercent / 100));
  const netActiveBeforeRounding = Math.max(0, rawActiveUnused - penaltyDeduction);
  const roundedActiveRefund = roundDownToStep(netActiveBeforeRounding, roundingStep);

  // 2. Kalkulasi akhir berdasarkan refundMode
  let autoCalculatedRefund = 0;
  if (hasQueued && refundMode === 'queued_only') {
    // Hanya batalkan paket antrian (100% utuh tanpa penalti)
    autoCalculatedRefund = queuedTotalPrice;
  } else if (hasQueued && refundMode === 'full') {
    // Batal antrian 100% + sisa paket aktif pro-rata dengan penalti
    autoCalculatedRefund = queuedTotalPrice + roundedActiveRefund;
  } else {
    // Kasus normal tanpa paket bertumpuk
    autoCalculatedRefund = roundedActiveRefund;
  }

  const finalRefundAmount = autoCalculatedRefund;

  const formatHoursMinutes = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} menit`;
    if (m === 0) return `${h} jam`;
    return `${h} jam ${m} menit`;
  };

  const handleConfirm = () => {
    const finalReason = customNote.trim()
      ? `${selectedReason} • ${customNote.trim()}`
      : selectedReason;

    onConfirmRefund(pc, {
      reason: finalReason,
      refundToBalance: isMember && refundToBalance,
      customAmount: finalRefundAmount,
      penaltyPercent,
      refundMode: hasQueued ? refundMode : 'full'
    });
  };

  const refundsActive = !hasQueued || refundMode === 'full';
  const unknownPrice = refundsActive && activeBasePrice <= 0;
  const Row = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-hairline last:border-b-0 text-[13px]">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`font-mono tabular text-right ${tone || 'text-text-primary'}`}>{value}</dd>
    </div>
  );

  return (
    <Modal title={`Refund ${pc.name}`} onClose={onClose} width={520}>
      <div className="p-4 space-y-4">
        <p className="text-[13px] text-text-secondary">
          <span className="font-medium text-text-primary">{pc.username || 'Tamu'}</span>
          {isMember ? ', member' : ', tamu'} · {activeStackPackage?.name || pc.packageName || 'Paket'} · terpakai {formatHoursMinutes(timeUsedMin)}, sisa {formatHoursMinutes(activeRemainingMin)}
        </p>

        {hasQueued && (
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-[12px] font-medium text-text-secondary">
              Ada {queuedPackages.length} paket antre: {queuedPackages.map(p => p.name).join(', ')}
            </legend>
            {([
              { id: 'full', title: 'Selesai main', desc: 'Antrian dikembalikan penuh, sisa paket aktif dihitung pro-rata. PC langsung logout.' },
              { id: 'queued_only', title: 'Batalkan antrian saja', desc: `Kembalikan ${rupiah(queuedTotalPrice)} penuh. Pelanggan tetap main di paket aktif.` },
            ] as const).map(opt => (
              <label key={opt.id} className={`flex items-start gap-2.5 p-2.5 rounded-sm border cursor-pointer ${refundMode === opt.id ? 'border-primary bg-primary/10' : 'border-hairline hover:border-hairline-strong'}`}>
                <input type="radio" name="refund-mode" className="accent-primary mt-0.5" checked={refundMode === opt.id} onChange={() => setRefundMode(opt.id)} />
                <span>
                  <span className="block text-[13px] font-medium text-text-primary">{opt.title}</span>
                  <span className="block text-[12px] text-text-muted">{opt.desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="refund-reason" className="block mb-1 text-[12px] font-medium text-text-secondary">Alasan</label>
            <select id="refund-reason" className={INPUT} value={selectedReason} onChange={e => setSelectedReason(e.target.value)}>
              {REASON_PRESETS.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
            </select>
            <p className="mt-1 text-[12px] text-text-muted">{penaltyPercent === 0 ? 'Tanpa penalti.' : `Penalti ${penaltyPercent} persen dari pengaturan.`}</p>
          </div>
          <div>
            <label htmlFor="refund-note" className="block mb-1 text-[12px] font-medium text-text-secondary">Catatan</label>
            <input id="refund-note" className={INPUT} value={customNote} onChange={e => setCustomNote(e.target.value)} placeholder="Opsional" />
          </div>
        </div>

        <dl className="px-3 py-1 rounded-sm bg-surface-3/60 border border-hairline">
          {hasQueued && <Row label="Antrian belum dipakai" value={`+${rupiah(queuedTotalPrice)}`} />}
          {refundsActive && (
            <>
              <Row label={`Nilai sisa paket aktif, ${formatHoursMinutes(activeRemainingMin)}`} value={rupiah(rawActiveUnused)} />
              <Row label={`Penalti ${penaltyPercent}%`} value={penaltyDeduction > 0 ? `-${rupiah(penaltyDeduction)}` : 'Rp 0'} tone={penaltyDeduction > 0 ? 'text-error' : undefined} />
              <Row label={`Dibulatkan ke bawah, kelipatan ${rupiah(roundingStep)}`} value={rupiah(roundedActiveRefund)} />
            </>
          )}
        </dl>

        {unknownPrice && (
          <p role="alert" className="text-[12px] text-warning">Harga paket aktif tidak diketahui atau sesi ini gratis, jadi sisa waktunya tidak diuangkan.</p>
        )}

        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-text-secondary">{refundToBalance && isMember ? 'Masuk ke saldo member' : 'Diserahkan tunai'}</span>
          <span className="font-mono tabular text-[22px] font-semibold text-text-primary">{rupiah(finalRefundAmount)}</span>
        </div>

        {isMember && (
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" className="accent-primary w-4 h-4 mt-0.5" checked={refundToBalance} onChange={e => setRefundToBalance(e.target.checked)} />
            <span className="text-[13px] text-text-primary">
              Masukkan ke saldo {pc.username}
              <span className="block text-[12px] text-text-muted">Tidak ada uang keluar dari laci.</span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Batal</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={finalRefundAmount <= 0}
            className={`inline-flex items-center gap-2 h-9 px-4 rounded-sm bg-warning text-on-primary text-[13px] font-semibold hover:brightness-110 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none ${FOCUS}`}
          >
            <Banknote className="w-4 h-4" aria-hidden />
            {hasQueued && refundMode === 'queued_only' ? 'Batalkan Antrian' : 'Refund'} {rupiah(finalRefundAmount)}
          </button>
        </div>
      </div>
    </Modal>
  );
};
