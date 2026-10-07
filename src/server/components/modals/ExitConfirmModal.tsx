import React from 'react';
import { Lock, LogOut, AlertTriangle } from 'lucide-react';
import { Modal, BTN_SECONDARY, FOCUS } from '../../../shared/ui/primitives';
import { cn } from '../../../shared/ui/utils';

interface ExitConfirmModalProps {
  isOpen: boolean;
  operatorName: string;
  onlineCount: number;
  totalClients: number;
  onClose: () => void;
  onLockOnly: () => void;
  onConfirmExit: () => void;
}

export const ExitConfirmModal: React.FC<ExitConfirmModalProps> = ({
  isOpen,
  operatorName,
  onlineCount,
  totalClients,
  onClose,
  onLockOnly,
  onConfirmExit
}) => {
  if (!isOpen) return null;

  return (
    <Modal title="Keluar / Kunci Layar Server" onClose={onClose} width={440}>
      <div className="p-4 space-y-4">
        {onlineCount > 0 ? (
          <div className="p-3 rounded-sm bg-warning/10 border border-warning/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-none mt-0.5" aria-hidden />
            <div className="text-[13px] text-text-primary">
              <span className="font-semibold text-warning block mb-0.5">Peringatan: Ada Sesi Aktif</span>
              Saat ini ada <strong className="font-mono tabular">{onlineCount}</strong> dari {totalClients} bilik PC sedang aktif. Menutup aplikasi server akan memutus koneksi billing kasir.
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary leading-relaxed">
            Apakah Anda ingin mengunci konsol server atau menutup aplikasi secara penuh?
          </p>
        )}

        <div className="p-3 rounded-sm bg-surface-3 border border-hairline flex items-center justify-between text-[12px]">
          <span className="text-text-muted">Operator Aktif:</span>
          <span className="font-semibold text-text-primary">{operatorName || 'Kasir'}</span>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Batal
          </button>
          <button
            type="button"
            onClick={onLockOnly}
            className={cn(BTN_SECONDARY, 'text-text-primary hover:border-primary')}
          >
            <Lock className="w-3.5 h-3.5 text-primary" aria-hidden />
            <span>Kunci Konsol</span>
          </button>
          <button
            type="button"
            onClick={onConfirmExit}
            className={`inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-sm bg-error/10 border border-error/40 text-error text-[13px] font-semibold hover:bg-error/20 active:translate-y-px transition-colors duration-150 ${FOCUS}`}
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden />
            <span>Tutup Server</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
