import React from 'react';
import { Workstation } from '../../../shared/types';
import { Modal, BTN_PRIMARY, BTN_SECONDARY } from '../../../shared/ui/primitives';
import { rupiah } from '../PcCard';
import { durationText } from '../PackagePricingView';

interface UnpaidSettlementReceiptModalProps {
  isOpen: boolean;
  pc: Workstation | null;
  onClose: () => void;
  onConfirmSettlement: (pc: Workstation) => void;
}

// Held postpaid bill: the cashier takes the money, BillingEngine.settleUnpaid records it and frees the PC.
export const UnpaidSettlementReceiptModal: React.FC<UnpaidSettlementReceiptModalProps> = ({ isOpen, pc, onClose, onConfirmSettlement }) => {
  if (!isOpen || !pc) return null;

  const amountToPay = pc.unpaidAmount ?? 0;
  const started = pc.sessionStartedAt
    ? new Date(pc.sessionStartedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : pc.startTime;

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-hairline last:border-b-0 text-[13px]">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-mono tabular text-text-primary">{value}</dd>
    </div>
  );

  return (
    <Modal title={`Tagihan ${pc.name}`} onClose={onClose} width={400}>
      <div className="p-4 space-y-4">
        <p className="text-[13px] text-text-secondary">
          <span className="font-medium text-text-primary">{pc.username || 'Tamu'}</span> belum bayar. Terima uangnya, lalu PC kembali tersedia.
        </p>

        <dl>
          {started && <Row label="Mulai" value={started} />}
          <Row label="Lama main" value={durationText(pc.timeUsedMinutes || 0)} />
          {pc.packageName && <Row label="Tarif" value={pc.packageName} />}
          <Row label="Pemakaian PC" value={rupiah(amountToPay)} />
        </dl>

        <div className="flex items-baseline justify-between pt-1 border-t border-hairline-strong">
          <span className="text-[13px] font-semibold text-text-primary">Total bayar</span>
          <span className="font-mono tabular text-[22px] font-semibold text-text-primary">{rupiah(amountToPay)}</span>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Nanti</button>
          <button
            type="button"
            onClick={() => {
              onConfirmSettlement(pc);
              onClose();
            }}
            className={BTN_PRIMARY}
          >
            Uang Diterima
          </button>
        </div>
      </div>
    </Modal>
  );
};
