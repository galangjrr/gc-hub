import React, { useState, useEffect } from 'react';
import { Workstation, OrderRecord, OrderItemDetail } from '../../../shared/types';
import { Modal, INPUT, BTN_PRIMARY, BTN_SECONDARY, FOCUS, TH, TD } from '../../../shared/ui/primitives';
import { rupiah } from '../PcCard';

// F&B order from a booth: paid up front, in cash or from the member's balance (see project payments note).
// DbService.approveOrder re-checks stock, the balance and that the order is still pending.

interface OrderApprovalModalProps {
  isOpen: boolean;
  pc: Workstation | null;
  order?: OrderRecord | null;
  onClose: () => void;
  onApproveOrder: (pc: Workstation, orderId: number, payMethod: 'cash' | 'saldo', items: OrderItemDetail[]) => void;
  onRejectOrder: (pc: Workstation, orderId: number, reason: string) => void;
}

const REJECT_REASONS = ['Stok bahan habis', 'Dapur sudah tutup', 'Pesanan dibatalkan pelanggan'];

export const OrderApprovalModal: React.FC<OrderApprovalModalProps> = ({ isOpen, pc, order, onClose, onApproveOrder, onRejectOrder }) => {
  const [payMethod, setPayMethod] = useState<'cash' | 'saldo'>('cash');
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [isRejecting, setIsRejecting] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsRejecting(false);
    setPayMethod('cash');
    if (order) {
      setCurrentOrder(order);
      return;
    }
    setCurrentOrder(null);
    if (!isOpen || !pc) return;
    setLoading(true);
    (window as any).electronAPI?.getPendingOrders?.()
      .then((list: OrderRecord[]) => setCurrentOrder(list.find(o => o.pcId.toUpperCase() === pc.name.toUpperCase()) || null))
      .catch(() => setCurrentOrder(null))
      .finally(() => setLoading(false));
  }, [isOpen, pc, order]);

  if (!isOpen || !pc) return null;

  const items = currentOrder?.items || [];
  const total = items.reduce((sum, it) => sum + (it.totalPrice || it.unitPrice * it.amount), 0);
  const isMember = pc.userType === 'member';

  const approve = () => {
    if (!currentOrder) return;
    onApproveOrder(pc, currentOrder.id, payMethod, items);
    onClose();
  };

  const reject = () => {
    if (!currentOrder || !rejectReason.trim()) return;
    onRejectOrder(pc, currentOrder.id, rejectReason.trim());
    onClose();
  };

  return (
    <Modal title={`Pesanan ${pc.name}`} onClose={onClose} width={560}>
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="space-y-2" aria-busy aria-label="Memuat pesanan">
            {[0, 1, 2].map(i => <div key={i} className="h-8 rounded-sm bg-surface-3 animate-pulse" />)}
          </div>
        ) : !currentOrder ? (
          <>
            <p className="text-[13px] text-text-muted">Tidak ada pesanan yang menunggu dari {pc.name}.</p>
            <div className="flex justify-end"><button type="button" onClick={onClose} className={BTN_SECONDARY}>Tutup</button></div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-text-secondary">
              <span className="font-medium text-text-primary">{currentOrder.username || pc.username || 'Tamu'}</span>
              <span className="font-mono text-text-muted"> · {currentOrder.orderCode}</span>
            </p>

            <table className="w-full border-collapse">
              <thead className="border-b border-hairline">
                <tr>
                  <th className={TH}>Menu</th>
                  <th className={`${TH} text-right`}>Jumlah</th>
                  <th className={`${TH} text-right`}>Harga</th>
                  <th className={`${TH} text-right`}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-hairline last:border-b-0">
                    <td className={`${TD} text-text-primary`}>{it.name}</td>
                    <td className={`${TD} text-right font-mono tabular text-text-primary`}>{it.amount}</td>
                    <td className={`${TD} text-right font-mono tabular text-text-muted`}>{rupiah(it.unitPrice)}</td>
                    <td className={`${TD} text-right font-mono tabular text-text-primary`}>{rupiah(it.totalPrice || it.unitPrice * it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {currentOrder.note && (
              <p className="px-3 py-2 rounded-sm border border-warning/40 bg-warning/10 text-[13px] text-text-primary">
                Catatan pemesan: {currentOrder.note}
              </p>
            )}

            <div className="flex items-baseline justify-between pt-1 border-t border-hairline-strong">
              <span className="text-[13px] font-semibold text-text-primary">Total</span>
              <span className="font-mono tabular text-[22px] font-semibold text-text-primary">{rupiah(total)}</span>
            </div>

            {isRejecting ? (
              <div className="space-y-2">
                <label htmlFor="reject-reason" className="block text-[12px] font-medium text-text-secondary">Alasan ditolak, dikirim ke layar pemesan</label>
                <input id="reject-reason" list="reject-reasons" autoFocus className={INPUT} value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                <datalist id="reject-reasons">{REJECT_REASONS.map(r => <option key={r} value={r} />)}</datalist>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setIsRejecting(false)} className={BTN_SECONDARY}>Kembali</button>
                  <button type="button" onClick={reject} disabled={!rejectReason.trim()} className={`h-9 px-4 rounded-sm bg-error text-white text-[13px] font-semibold hover:brightness-110 active:translate-y-px disabled:opacity-50 ${FOCUS}`}>
                    Tolak Pesanan
                  </button>
                </div>
              </div>
            ) : (
              <>
                <fieldset>
                  <legend className="mb-1.5 text-[12px] font-medium text-text-secondary">Dibayar dengan</legend>
                  <div className="flex gap-2">
                    {([
                      { id: 'cash', label: 'Tunai', disabled: false, hint: '' },
                      { id: 'saldo', label: 'Potong saldo member', disabled: !isMember, hint: isMember ? '' : 'hanya untuk member' },
                    ] as const).map(m => (
                      <label key={m.id} className={`flex items-center gap-2 h-9 px-3 rounded-sm border text-[13px] ${m.disabled ? 'opacity-50 cursor-not-allowed border-hairline text-text-disabled' : payMethod === m.id ? 'border-primary bg-primary/10 text-text-primary cursor-pointer' : 'border-hairline text-text-secondary hover:border-hairline-strong cursor-pointer'}`}>
                        <input type="radio" name="order-pay" className="accent-primary" disabled={m.disabled} checked={payMethod === m.id} onChange={() => setPayMethod(m.id)} />
                        {m.label}
                        {m.hint && <span className="text-[12px]">, {m.hint}</span>}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setIsRejecting(true)} className={`h-9 px-3 rounded-sm border border-error/40 text-error text-[13px] font-medium hover:bg-error/10 active:translate-y-px ${FOCUS}`}>
                    Tolak
                  </button>
                  <button type="button" onClick={approve} className={BTN_PRIMARY}>
                    Terima {rupiah(total)}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
