import React, { useState } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { VoucherBatchGenerateParams } from '../../../shared/types';
import { Modal, Field, INPUT, BTN_PRIMARY, BTN_SECONDARY } from '../../../shared/ui/primitives';
import { cn } from '../../../shared/ui/utils';

interface CouponBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (params: VoucherBatchGenerateParams) => void;
}

const PRESET_VOUCHERS = [
  { label: '1 Jam (Rp 4.000)', type: 'time' as const, value: 4000, duration: 60 },
  { label: '2 Jam (Rp 8.000)', type: 'time' as const, value: 8000, duration: 120 },
  { label: '3 Jam (Rp 12.000)', type: 'time' as const, value: 12000, duration: 180 },
  { label: '5 Jam (Rp 20.000)', type: 'time' as const, value: 20000, duration: 300 },
  { label: 'Saldo Rp 5.000', type: 'money' as const, value: 5000, duration: 0 },
  { label: 'Saldo Rp 10.000', type: 'money' as const, value: 10000, duration: 0 },
  { label: 'Saldo Rp 20.000', type: 'money' as const, value: 20000, duration: 0 },
];

export const CouponBatchModal: React.FC<CouponBatchModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
}) => {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [prefix, setPrefix] = useState('GC');
  const [count, setCount] = useState(10);
  const [customType, setCustomType] = useState<'time' | 'money'>('time');
  const [customValue, setCustomValue] = useState(4000);
  const [customDuration, setCustomDuration] = useState(60);
  const [isCustom, setIsCustom] = useState(false);
  const [userGroupId, setUserGroupId] = useState(1);
  const [expireDays, setExpireDays] = useState(30);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCustom) {
      onGenerate({
        count,
        prefix,
        type: customType,
        value: customValue,
        durationMinutes: customType === 'time' ? customDuration : 0,
        userGroupId,
        expireDays
      });
    } else {
      const preset = PRESET_VOUCHERS[selectedPresetIndex];
      onGenerate({
        count,
        prefix,
        type: preset.type,
        value: preset.value,
        durationMinutes: preset.duration,
        userGroupId,
        expireDays
      });
    }
    onClose();
  };

  return (
    <Modal
      title="Cetak Batch Voucher Prabayar"
      onClose={onClose}
      width={500}
    >
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Prefix & Group */}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Prefix Kode"
            htmlFor="coupon-prefix"
            hint={`Format: ${prefix || 'GC'}-0001-XXXX`}
          >
            <input
              id="coupon-prefix"
              type="text"
              value={prefix}
              onChange={e => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="GC"
              className={cn(INPUT, 'font-mono font-bold uppercase')}
            />
          </Field>

          <Field label="Tier Hak Akses" htmlFor="coupon-group">
            <select
              id="coupon-group"
              value={userGroupId}
              onChange={e => setUserGroupId(Number(e.target.value))}
              className={INPUT}
            >
              <option value={1}>Reguler / Umum</option>
              <option value={2}>VIP Room</option>
            </select>
          </Field>
        </div>

        {/* Presets */}
        <div>
          <label className="block mb-1.5 text-[12px] font-medium text-text-secondary">
            Pilihan Template Voucher
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_VOUCHERS.map((preset, idx) => {
              const isSelected = !isCustom && selectedPresetIndex === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setIsCustom(false);
                    setSelectedPresetIndex(idx);
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-sm text-left transition-colors text-[12px] border ${
                    isSelected
                      ? 'bg-primary/10 border-primary text-text-primary'
                      : 'bg-surface-2 border-hairline text-text-secondary hover:bg-surface-3 hover:text-text-primary'
                  }`}
                >
                  <span className="font-medium">{preset.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary flex-none" />}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setIsCustom(true)}
              className={`flex items-center justify-between p-2.5 rounded-sm text-left transition-colors col-span-2 text-[12px] border ${
                isCustom
                  ? 'bg-primary/10 border-primary text-text-primary'
                  : 'bg-surface-2 border-hairline text-text-secondary hover:bg-surface-3 hover:text-text-primary'
              }`}
            >
              <span className="font-medium">Kustom Nilai atau Waktu Sendiri</span>
              {isCustom && <Check className="w-3.5 h-3.5 text-primary flex-none" />}
            </button>
          </div>
        </div>

        {/* Custom Settings */}
        {isCustom && (
          <div className="p-3 rounded-sm bg-surface-3 border border-hairline space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipe Voucher" htmlFor="custom-type">
                <select
                  id="custom-type"
                  value={customType}
                  onChange={e => setCustomType(e.target.value as any)}
                  className={INPUT}
                >
                  <option value="time">Waktu Sewa Menit</option>
                  <option value="money">Nominal Saldo Rupiah</option>
                </select>
              </Field>

              <Field
                label={customType === 'time' ? 'Durasi (Menit)' : 'Nominal (Rp)'}
                htmlFor="custom-val"
              >
                <input
                  id="custom-val"
                  type="number"
                  value={customType === 'time' ? customDuration : customValue}
                  onChange={e => {
                    const num = Number(e.target.value) || 0;
                    if (customType === 'time') {
                      setCustomDuration(num);
                      setCustomValue(Math.round((num / 60) * 4000));
                    } else {
                      setCustomValue(num);
                    }
                  }}
                  className={cn(INPUT, 'font-mono tabular')}
                />
              </Field>
            </div>
          </div>
        )}

        {/* Count & Expire */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jumlah Lembar Dicetak" htmlFor="coupon-count">
            <select
              id="coupon-count"
              value={count}
              onChange={e => setCount(Number(e.target.value))}
              className={INPUT}
            >
              <option value={5}>5 Lembar Voucher</option>
              <option value={10}>10 Lembar Voucher</option>
              <option value={20}>20 Lembar Voucher</option>
              <option value={50}>50 Lembar Voucher</option>
              <option value={100}>100 Lembar Voucher</option>
            </select>
          </Field>

          <Field label="Masa Berlaku" htmlFor="coupon-expire">
            <select
              id="coupon-expire"
              value={expireDays}
              onChange={e => setExpireDays(Number(e.target.value))}
              className={INPUT}
            >
              <option value={7}>7 Hari (1 Minggu)</option>
              <option value={14}>14 Hari (2 Minggu)</option>
              <option value={30}>30 Hari (1 Bulan)</option>
              <option value={60}>60 Hari (2 Bulan)</option>
              <option value={365}>365 Hari (1 Tahun)</option>
            </select>
          </Field>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Batal
          </button>
          <button type="submit" className={BTN_PRIMARY}>
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            Cetak {count} Voucher
          </button>
        </div>
      </form>
    </Modal>
  );
};
