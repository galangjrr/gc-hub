import React from 'react';
import { AlertCircle, Check, X, Info } from 'lucide-react';

export type DialogType = 'info' | 'warning' | 'confirm' | 'error' | 'success';

interface GCHubDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}


const SEMANTIC = {
  warning: { bg: 'rgb(var(--gc-warning) / 0.1)', border: 'rgb(var(--gc-warning) / 0.3)', icon: 'rgb(var(--gc-warning))' },
  confirm: { bg: 'rgb(var(--gc-warning) / 0.1)', border: 'rgb(var(--gc-warning) / 0.3)', icon: 'rgb(var(--gc-warning))' },
  error:   { bg: 'rgb(var(--gc-error) / 0.1)', border: 'rgb(var(--gc-error) / 0.3)', icon: 'rgb(var(--gc-error))' },
  info:    { bg: 'rgb(var(--gc-info) / 0.1)', border: 'rgb(var(--gc-info) / 0.3)', icon: 'rgb(var(--gc-info))' },
  success: { bg: 'rgb(var(--gc-primary) / 0.1)', border: 'rgb(var(--gc-primary) / 0.3)', icon: 'rgb(var(--gc-primary))' },
};

export const GCHubDialog: React.FC<GCHubDialogProps> = ({
  isOpen,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText = 'Batal',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  const isConfirmDialog = type === 'confirm' || Boolean(onCancel);
  const sem = SEMANTIC[type] || SEMANTIC.info;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 select-none"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-[320px] overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        style={{ background: 'rgb(var(--gc-surface-2))', border: '1px solid rgb(var(--gc-hairline-strong))', borderRadius: '6px' }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgb(var(--gc-hairline))' }}>
          <div className="flex items-center space-x-2">
            {/* BMW-M stripe accent */}
            <div className="flex space-x-[2px]">
              <div className="w-[3px] h-3.5 rounded-sm" style={{ background: 'rgb(var(--gc-surface-3))' }} />
              <div className="w-[3px] h-3.5 rounded-sm" style={{ background: 'rgb(var(--gc-info))' }} />
              <div className="w-[3px] h-3.5 rounded-sm" style={{ background: 'rgb(var(--gc-error))' }} />
            </div>
            <span className="text-[13px] font-semibold" style={{ color: 'rgb(var(--gc-text-primary))', letterSpacing: '-0.08px' }}>
              GC Hub — {title}
            </span>
          </div>
          <button
            onClick={onCancel || onConfirm}
            className="w-5 h-5 flex items-center justify-center rounded transition"
            style={{ color: 'rgb(var(--gc-text-muted))' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgb(var(--gc-text-primary))'; e.currentTarget.style.background = 'rgb(var(--gc-surface-3))'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgb(var(--gc-text-muted))'; e.currentTarget.style.background = 'transparent'; }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex items-start space-x-3">
            <div
              className="w-9 h-9 rounded flex items-center justify-center flex-none"
              style={{ background: sem.bg, border: `1px solid ${sem.border}` }}
            >
              {type === 'warning' || type === 'confirm'
                ? <AlertCircle className="w-5 h-5" style={{ color: sem.icon }} />
                : type === 'error'
                  ? <X className="w-5 h-5" style={{ color: sem.icon }} />
                  : <Info className="w-5 h-5" style={{ color: sem.icon }} />
              }
            </div>
            <p className="text-[13px] leading-relaxed pt-1" style={{ color: 'rgb(var(--gc-text-secondary))' }}>
              {message}
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-2 pt-1">
            {isConfirmDialog && (
              <button
                type="button"
                onClick={onCancel}
                className="flex items-center space-x-1.5 px-4 py-2 text-[12px] font-semibold transition"
                style={{ background: 'rgb(var(--gc-surface-3))', border: '1px solid rgb(var(--gc-hairline-strong))', borderRadius: '4px', color: 'rgb(var(--gc-text-secondary))', letterSpacing: '0.04em' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgb(var(--gc-surface-carbon))'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgb(var(--gc-surface-3))'; }}
              >
                <X className="w-3 h-3" />
                <span>{cancelText}</span>
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={onConfirm}
              className="flex items-center space-x-1.5 px-4 py-2 text-[12px] font-semibold transition"
              style={{ background: 'rgb(var(--gc-primary))', color: '#000', borderRadius: '4px', border: 'none', letterSpacing: '0.04em' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgb(var(--gc-primary-hover))'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgb(var(--gc-primary))'; }}
            >
              <Check className="w-3 h-3" />
              <span>{confirmText}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

