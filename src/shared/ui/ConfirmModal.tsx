import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, Banknote, LogOut, HelpCircle, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  detail?: string;
  iconType?: 'danger' | 'warning' | 'refund' | 'logout' | 'info';
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onClose: () => void;
}

const ICONS = {
  refund: { Icon: Banknote, color: 'text-warning' },
  logout: { Icon: LogOut, color: 'text-error' },
  warning: { Icon: AlertTriangle, color: 'text-warning' },
  info: { Icon: HelpCircle, color: 'text-info' },
  danger: { Icon: Trash2, color: 'text-error' },
};

const CONFIRM_CLASSES = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  warning: 'bg-warning text-on-primary hover:brightness-110',
  danger: 'bg-error text-white hover:brightness-110',
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  detail,
  iconType = 'danger',
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  confirmVariant = 'danger',
  onConfirm,
  onClose
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter') {
        e.stopPropagation();
        onConfirm();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onClose]);

  if (!isOpen) return null;

  const { Icon, color } = ICONS[iconType] || ICONS.danger;

  // Dialog per DESIGN.md section 4: title left, close right, no large decorative icon.
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 select-none" onClick={onClose}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        className="w-full max-w-[420px] bg-surface-2 border border-hairline rounded-md shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 px-4 h-12 border-b border-hairline">
          <Icon className={`w-4 h-4 flex-none ${color}`} aria-hidden />
          <h2 id="confirm-modal-title" className="flex-1 min-w-0 truncate text-[15px] font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>

        <div id="confirm-modal-desc" className="px-4 py-4 space-y-2">
          <p className="text-[13px] text-text-primary">{description}</p>
          {detail && <p className="text-[12px] text-text-muted">{detail}</p>}
        </div>

        <footer className="flex justify-end gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 rounded-sm bg-surface-2 border border-hairline text-[13px] font-medium text-text-primary hover:bg-surface-3 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`h-9 px-4 rounded-sm text-[13px] font-semibold active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${CONFIRM_CLASSES[confirmVariant] || CONFIRM_CLASSES.danger}`}
          >
            {confirmText}
          </button>
        </footer>
      </div>
    </div>
  );
};
