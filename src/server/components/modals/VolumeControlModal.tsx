import React, { useState } from 'react';
import { Workstation } from '../../../shared/types';
import { Volume2, VolumeX, ChevronUp, ChevronDown } from 'lucide-react';
import { Modal, BTN_PRIMARY, BTN_SECONDARY } from '../../../shared/ui/primitives';

interface VolumeControlModalProps {
  isOpen: boolean;
  pc: Workstation | null;
  onClose: () => void;
  onApply?: (volume: number, isMuted: boolean) => void;
  onApplyVolume?: (pc: Workstation, volume: number, isMuted: boolean) => void;
}

export const VolumeControlModal: React.FC<VolumeControlModalProps> = ({
  isOpen, pc, onClose, onApply, onApplyVolume
}) => {
  const [volume, setVolume] = useState<number>(pc?.volume ?? 80);
  const [isMuted, setIsMuted] = useState<boolean>(pc?.isMuted ?? false);

  if (!isOpen || !pc) return null;

  const handleSave = () => {
    if (onApplyVolume) onApplyVolume(pc, volume, isMuted);
    if (onApply) onApply(volume, isMuted);
    onClose();
  };

  const displayVolume = isMuted ? 0 : volume;

  return (
    <Modal title={`Volume Suara — ${pc.name}`} onClose={onClose} width={360}>
      <div className="p-4 space-y-4">
        {/* Volume slider container */}
        <div className="p-3.5 space-y-3 rounded-sm bg-surface-2 border border-hairline">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              Tingkat Volume
            </span>
            <span className={`text-[20px] font-bold font-mono tabular ${isMuted ? 'text-text-disabled' : 'text-primary'}`}>
              {displayVolume}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isMuted ? (
              <VolumeX className="w-5 h-5 flex-none text-text-disabled" aria-hidden />
            ) : (
              <Volume2 className="w-5 h-5 flex-none text-primary" aria-hidden />
            )}
            <input
              type="range"
              min="0"
              max="100"
              value={displayVolume}
              onChange={e => {
                setVolume(Number(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              className="flex-1 cursor-pointer accent-primary"
            />
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => setVolume(v => Math.min(100, v + 5))}
                className="w-5 h-4 flex items-center justify-center rounded-xs bg-surface-3 border border-hairline text-text-secondary hover:text-text-primary hover:border-hairline-strong transition-colors"
                aria-label="Naikkan volume 5 persen"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setVolume(v => Math.max(0, v - 5))}
                className="w-5 h-4 flex items-center justify-center rounded-xs bg-surface-3 border border-hairline text-text-secondary hover:text-text-primary hover:border-hairline-strong transition-colors"
                aria-label="Turunkan volume 5 persen"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isMuted}
              onChange={e => setIsMuted(e.target.checked)}
              className="w-4 h-4 rounded-xs border-hairline accent-primary cursor-pointer"
            />
            <span className="text-[12px] font-medium text-text-secondary">Bisukan Suara (Mute)</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Tutup
          </button>
          <button type="button" onClick={handleSave} className={BTN_PRIMARY}>
            Terapkan
          </button>
        </div>
      </div>
    </Modal>
  );
};
