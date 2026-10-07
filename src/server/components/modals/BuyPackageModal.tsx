import React, { useState, useMemo, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Workstation, MemberAccount, BillingPackage } from '../../../shared/types';
import { isPackageOnSale, saleWindowText } from '../../../shared/packageRules';
import { Modal, INPUT, BTN_PRIMARY, BTN_SECONDARY, FOCUS } from '../../../shared/ui/primitives';
import { CATEGORIES, categoryOf, durationText } from '../PackagePricingView';
import { rupiah } from '../PcCard';
import { cn } from '../../../shared/ui/utils';

// Three uses, one list: start a session on an idle PC, manage packages on a running prepaid PC
// (replace or add), or top up a member's balance with a package's price (from the Akun tab).
// Replace and add follow BillingEngine.replacePackage / addStackedPackage exactly.

interface BuyPackageModalProps {
  isOpen: boolean;
  target: Workstation | MemberAccount | null;
  packages: BillingPackage[];
  mode?: 'start' | 'extension';
  onClose: () => void;
  onConfirm?: (pkg: BillingPackage, actionType?: 'replace' | 'stack' | 'start') => void;
  onSelectPackage?: (pkg: BillingPackage, target: Workstation | MemberAccount | null, actionType?: 'replace' | 'stack' | 'start') => void;
}

export const BuyPackageModal: React.FC<BuyPackageModalProps> = ({
  isOpen,
  target,
  packages,
  mode = 'extension',
  onClose,
  onConfirm,
  onSelectPackage,
}) => {
  const [category, setCategory] = useState<string>('Semua');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stacking, setStacking] = useState(true);

  const pc = target && 'state' in target ? (target as Workstation) : null;
  const member = target && !pc ? (target as MemberAccount) : null;
  const starting = !!pc && (mode === 'start' || pc.state === 'idle' || pc.state === 'offline');

  useEffect(() => {
    if (!isOpen) return;
    (window as any).electronAPI?.getSetting?.('allowStackedPackages').then((v: string) => setStacking(v !== 'false')).catch(() => {});
  }, [isOpen]);

  const onSale = useMemo(() => packages.filter(p => isPackageOnSale(p) && !(starting && p.isExtensionOnly)), [packages, starting]);
  const offWindow = packages.filter(p => !isPackageOnSale(p));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return onSale.filter(p => (category === 'Semua' || categoryOf(p) === category)
      && (!q || p.name.toLowerCase().includes(q) || String(p.price).includes(q)));
  }, [onSale, category, query]);

  useEffect(() => {
    if (!visible.some(p => p.id === selectedId)) setSelectedId(visible[0]?.id ?? null);
  }, [visible, selectedId]);

  if (!isOpen || !target) return null;

  const selected = visible.find(p => p.id === selectedId) || null;
  const chips = ['Semua', ...CATEGORIES.map(c => c.id).filter(id => onSale.some(p => categoryOf(p) === id))];

  // Replace preview, same numbers as BillingEngine.replacePackage
  const usedMin = pc?.timeUsedMinutes || 0;
  const activePrice = pc?.stackedPackages?.find(p => p.status === 'In Use')?.price ?? pc?.moneyUsed ?? 0;
  const canReplace = !!selected && selected.minutes > usedMin;
  const replaceDiff = selected ? Math.max(0, selected.price - activePrice) : 0;

  const apply = (action: 'replace' | 'stack' | 'start') => {
    if (!selected) return;
    onSelectPackage?.(selected, target, action);
    onConfirm?.(selected, action);
    onClose();
  };

  const title = member ? `Isi Saldo ${member.username}` : starting ? `Mulai Sesi ${pc?.name}` : `Paket ${pc?.name}`;

  return (
    <Modal title={title} onClose={onClose} width={640}>
      <div className="flex flex-col max-h-[calc(90vh-48px)]">
        <div className="flex-none flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
          <div role="group" aria-label="Saring kategori" className="flex flex-wrap gap-1">
            {chips.map(id => (
              <button
                key={id}
                type="button"
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
                className={`h-7 px-2.5 rounded-sm text-[12px] transition-colors duration-150 ${FOCUS} ${category === id ? 'bg-surface-3 text-text-primary shadow-[inset_0_0_0_1px_rgb(var(--gc-hairline-strong))]' : 'text-text-muted hover:text-text-primary'}`}
              >
                {id === 'Semua' ? 'Semua' : CATEGORIES.find(c => c.id === id)?.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="relative w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
            <label htmlFor="buy-search" className="sr-only">Cari paket</label>
            <input id="buy-search" className={cn(INPUT, 'h-8 pl-8')} value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama atau harga" />
          </div>
        </div>

        {offWindow.length > 0 && (
          <p className="flex-none px-4 pb-2 text-[12px] text-text-muted">
            Tidak dijual sekarang: {offWindow.map(p => `${p.name} (${saleWindowText(p)})`).join(', ')}.
          </p>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-text-muted">
              {onSale.length === 0 ? 'Belum ada paket yang bisa dijual. Tambah paket di Pengaturan, tab Tarif.' : 'Tidak ada paket yang cocok.'}
            </p>
          ) : (
            <div role="radiogroup" aria-label="Pilih paket" className="border border-hairline rounded-sm">
              {visible.map(pkg => {
                const on = pkg.id === selectedId;
                return (
                  <label
                    key={pkg.id}
                    className={`flex items-center gap-3 px-3 h-11 border-b border-hairline last:border-b-0 cursor-pointer ${on ? 'bg-primary/10' : 'hover:bg-surface-3'}`}
                  >
                    <input type="radio" name="buy-package" className="accent-primary" checked={on} onChange={() => setSelectedId(pkg.id)} />
                    <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-text-primary">
                      {pkg.name}
                      {pkg.popular && <span className="ml-2 inline-flex items-center h-5 px-1.5 rounded-xs text-[11px] font-semibold bg-primary/15 text-primary align-middle">Populer</span>}
                      {pkg.isExtensionOnly && <span className="ml-2 text-[12px] font-normal text-text-muted">khusus tambah waktu</span>}
                    </span>
                    <span className="w-28 text-right font-mono tabular text-[12px] text-text-secondary">{durationText(pkg.minutes)}</span>
                    <span className="w-24 text-right font-mono tabular text-[13px] font-semibold text-text-primary">{rupiah(pkg.price)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex-none px-4 py-3 mt-3 border-t border-hairline space-y-2">
          {selected && pc && !starting && (
            <p className={`text-[12px] tabular ${canReplace ? 'text-text-muted' : 'text-warning'}`}>
              {canReplace
                ? `Ganti: terpakai ${durationText(usedMin)} tetap dihitung, sisa jadi ${durationText(selected.minutes - usedMin)}, tambah bayar ${rupiah(replaceDiff)}${selected.price < activePrice ? '. Turun ke paket lebih murah tidak mengembalikan uang' : ''}.`
                : `Tidak bisa ganti: ${selected.name} (${durationText(selected.minutes)}) tidak lebih lama dari waktu terpakai ${durationText(usedMin)}.`}
              {' '}
              {stacking ? 'Tambah: masuk antrian, aktif setelah paket sekarang habis.' : 'Tambah: langsung menambah waktu paket sekarang.'}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Batal</button>
            {member && (
              <button type="button" disabled={!selected} onClick={() => apply('stack')} className={BTN_PRIMARY}>
                Isi Saldo {selected ? rupiah(selected.price) : ''}
              </button>
            )}
            {pc && starting && (
              <button type="button" disabled={!selected} onClick={() => apply('start')} className={BTN_PRIMARY}>
                Mulai {selected ? rupiah(selected.price) : ''}
              </button>
            )}
            {pc && !starting && (
              <>
                <button type="button" disabled={!canReplace} onClick={() => apply('replace')} className={BTN_SECONDARY}>
                  Ganti Paket
                </button>
                <button type="button" disabled={!selected} onClick={() => apply('stack')} className={BTN_PRIMARY}>
                  Tambah {selected ? rupiah(selected.price) : ''}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </Modal>
  );
};
