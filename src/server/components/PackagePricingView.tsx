import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import { BillingPackage, PersonalRateConfig } from '../../shared/types';
import { calcPersonalBill, normalizeAccumulationMinutes, normalizeRoundingStep, roundDownToStep, RoundingStep } from '../../shared/personalBilling';
import { isPackageOnSale, saleWindowText } from '../../shared/packageRules';
import { ConfirmModal } from './modals/ConfirmModal';
import { rupiah } from './PcCard';
import { api, denied, INPUT, BTN_PRIMARY, BTN_SECONDARY, BTN_GHOST, FOCUS, Panel, Field, ReadOnlyNote, ErrorLine, SkeletonRows, TH, TD, Modal } from './settingsUi';
import { cn } from '../../shared/ui/utils';
import { PcRateSection } from './PcRateSection';

// Tab Tarif di Pengaturan. Setiap field di sini dibaca engine billing (src/server/engine/billingEngine.ts);
// jangan menambah pilihan yang tidak dipakai engine.

interface PackagePricingViewProps {
  packages: BillingPackage[];
  personalRates: PersonalRateConfig[];
  activePersonalRateId: string;
  onUpdatePackages: (packages: BillingPackage[]) => unknown; // resolves to false when the server refused
  onUpdatePersonalRates: (rates: PersonalRateConfig[]) => unknown;
  onSelectActivePersonalRate: (id: string) => void;
  onTriggerToast?: (title: string, message: string) => void;
  canEdit: boolean; // only admins change tariffs; main process enforces it too
}

type Category = NonNullable<BillingPackage['category']>;

export const CATEGORIES: Array<{ id: Category; label: string; hint: string }> = [
  { id: 'Jam', label: 'Durasi jam', hint: 'Paket waktu tetap, misal 1 jam atau 3 jam.' },
  { id: 'Nominal', label: 'Nominal', hint: 'Paket yang dijual per nominal uang, misal Rp 5.000 dapat 1 jam 15 menit.' },
  { id: 'Happy Hour', label: 'Happy Hour', hint: 'Hanya dijual pada jam tertentu, misal paket malam 22.00 sampai 06.00.' },
  { id: 'Tambah Waktu', label: 'Tambah waktu', hint: 'Hanya untuk menambah waktu PC yang sedang dipakai, tidak bisa membuka sesi baru.' },
  { id: 'Custom', label: 'Khusus', hint: 'Paket event, turnamen, atau akhir pekan.' },
];
export const categoryOf = (pkg: BillingPackage): Category => pkg.category || (pkg.isExtensionOnly ? 'Tambah Waktu' : 'Jam');
export const categoryLabel = (id: Category) => CATEGORIES.find(c => c.id === id)?.label || id;

export const durationText = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} jam` : '', m ? `${m} menit` : ''].filter(Boolean).join(' ') || '0 menit';
};

type Section = 'personal' | 'paket' | 'pc' | 'aturan';
const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'personal', label: 'Tarif personal' },
  { id: 'paket', label: 'Paket prabayar' },
  { id: 'pc', label: 'Tarif per PC' },
  { id: 'aturan', label: 'Aturan billing' },
];

const numberOr = (value: string, fallback: number) => {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) ? n : fallback;
};

// ---------- Tarif personal ----------

type RateForm = { id: string | null; name: string; firstHour: string; nextHours: string; block: string; description: string; target: PersonalRateConfig['targetUserType'] };

const RateModal: React.FC<{ initial: RateForm; onClose: () => void; onSave: (rate: PersonalRateConfig) => void }> = ({ initial, onClose, onSave }) => {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof RateForm, string>>>({});
  const set = (patch: Partial<RateForm>) => setForm(f => ({ ...f, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const firstHour = numberOr(form.firstHour, -1);
    const nextHours = numberOr(form.nextHours, -1);
    const block = numberOr(form.block, 0);
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Nama tarif wajib diisi.';
    if (firstHour < 0) next.firstHour = 'Isi harga 0 atau lebih.';
    if (nextHours < 0) next.nextHours = 'Isi harga 0 atau lebih.';
    if (!Number.isInteger(block) || block < 1 || block > 60) next.block = 'Isi 1 sampai 60 menit.';
    setErrors(next);
    if (Object.keys(next).length) return;

    onSave({
      id: form.id || `rate-${Date.now()}`,
      name: form.name.trim(),
      firstHourPrice: Math.round(firstHour),
      nextHoursPrice: Math.round(nextHours),
      accumulationMinutes: normalizeAccumulationMinutes(block),
      targetUserType: form.target,
      description: form.description.trim() || undefined,
    });
  };

  return (
    <Modal title={form.id ? 'Ubah Tarif Personal' : 'Tambah Tarif Personal'} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3" noValidate>
        <Field label="Nama tarif" htmlFor="rate-name" error={errors.name}>
          <input id="rate-name" autoFocus className={INPUT} value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Contoh: Reguler Malam" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jam pertama (Rp)" htmlFor="rate-first" hint="Ditagih penuh sejak detik pertama." error={errors.firstHour}>
            <input id="rate-first" type="number" min={0} step={500} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={form.firstHour} onChange={e => set({ firstHour: e.target.value })} />
          </Field>
          <Field label="Jam berikutnya (Rp per jam)" htmlFor="rate-next" error={errors.nextHours}>
            <input id="rate-next" type="number" min={0} step={500} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={form.nextHours} onChange={e => set({ nextHours: e.target.value })} />
          </Field>
        </div>
        <Field label="Blok tagihan setelah jam pertama (menit)" htmlFor="rate-block" hint="Tiap blok yang dimulai langsung ditagih penuh. 60 berarti per jam." error={errors.block}>
          <input id="rate-block" type="number" min={1} max={60} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={form.block} onChange={e => set({ block: e.target.value })} />
        </Field>
        <Field label="Keterangan" htmlFor="rate-desc">
          <input id="rate-desc" className={INPUT} value={form.description} onChange={e => set({ description: e.target.value })} placeholder="Opsional" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Batal</button>
          <button type="submit" className={BTN_PRIMARY}>Simpan</button>
        </div>
      </form>
    </Modal>
  );
};

const PersonalSection: React.FC<{
  rates: PersonalRateConfig[];
  activeId: string;
  canEdit: boolean;
  roundingStep: RoundingStep;
  onSelect: (id: string) => void;
  onEdit: (form: RateForm) => void;
  onDelete: (rate: PersonalRateConfig) => void;
}> = ({ rates, activeId, canEdit, roundingStep, onSelect, onEdit, onDelete }) => {
  const active = rates.find(r => r.id === activeId) || rates[0];
  const [minutes, setMinutes] = useState(75);
  const bill = active ? calcPersonalBill(active, minutes * 60, roundingStep) : null;
  const block = active ? normalizeAccumulationMinutes(active.accumulationMinutes) : 60;
  const blocks = minutes > 60 ? Math.ceil((minutes - 60) / block) : 0;

  const blank: RateForm = { id: null, name: '', firstHour: '4000', nextHours: '3500', block: '60', description: '', target: 'all' };

  return (
    <>
      <Panel
        title="Tarif personal"
        description="Dipakai tombol Buka Personal di kasir untuk tamu yang bayar di akhir. Jam pertama ditagih penuh, lalu tiap blok yang dimulai ditagih penuh, seperti parkir."
        action={canEdit && (
          <button type="button" className={BTN_PRIMARY} onClick={() => onEdit(blank)}>
            <Plus className="w-4 h-4" aria-hidden /> Tambah Tarif
          </button>
        )}
      >
        {rates.length === 0 ? (
          <p className="text-[13px] text-text-muted">Belum ada tarif personal. Tambah tarif dari tombol di kanan atas supaya kasir bisa membuka sesi personal.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="border-b border-hairline">
              <tr>
                <th className={`${TH} w-20`}>Dipakai</th>
                <th className={TH}>Nama</th>
                <th className={`${TH} text-right`}>Jam pertama</th>
                <th className={`${TH} text-right`}>Jam berikutnya</th>
                <th className={`${TH} text-right`}>Blok</th>
                {canEdit && <th className={TH}><span className="sr-only">Aksi</span></th>}
              </tr>
            </thead>
            <tbody>
              {rates.map(rate => {
                const isActive = rate.id === active?.id;
                return (
                  <tr key={rate.id} className={`border-b border-hairline last:border-b-0 ${isActive ? 'bg-primary/5' : ''}`}>
                    <td className={TD}>
                      <input
                        type="radio"
                        name="active-personal-rate"
                        className="accent-primary w-4 h-4 align-middle"
                        checked={isActive}
                        disabled={!canEdit}
                        onChange={() => onSelect(rate.id)}
                        aria-label={`Pakai ${rate.name} untuk Buka Personal`}
                      />
                    </td>
                    <td className={`${TD} py-2`}>
                      <div className="font-medium text-text-primary">{rate.name}</div>
                      {rate.description && <div className="text-[12px] text-text-muted">{rate.description}</div>}
                    </td>
                    <td className={`${TD} text-right font-mono tabular text-text-primary`}>{rupiah(rate.firstHourPrice)}</td>
                    <td className={`${TD} text-right font-mono tabular text-text-primary`}>{rupiah(rate.nextHoursPrice)}</td>
                    <td className={`${TD} text-right font-mono tabular text-text-secondary`}>{normalizeAccumulationMinutes(rate.accumulationMinutes)}m</td>
                    {canEdit && (
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        <button type="button" className={cn(BTN_GHOST, 'text-text-secondary hover:text-text-primary hover:bg-surface-3')}
                          onClick={() => onEdit({
                            id: rate.id, name: rate.name, firstHour: String(rate.firstHourPrice), nextHours: String(rate.nextHoursPrice),
                            block: String(normalizeAccumulationMinutes(rate.accumulationMinutes)), description: rate.description || '', target: rate.targetUserType || 'all',
                          })}>
                          Ubah
                        </button>
                        <button type="button" className={cn(BTN_GHOST, 'text-error hover:bg-error/10')} onClick={() => onDelete(rate)}>Hapus</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {active && bill && (
        <Panel title="Simulasi tagihan" description={`Memakai tarif yang dipakai sekarang, ${active.name}, dengan pembulatan kasir Rp ${roundingStep.toLocaleString('id-ID')}.`}>
          <div className="grid grid-cols-[1fr_auto] gap-6 items-end">
            <div>
              <label htmlFor="sim-minutes" className="block mb-1 text-[12px] font-medium text-text-secondary">Lama main</label>
              <div className="flex items-center gap-3">
                <input id="sim-minutes" type="range" min={5} max={360} step={5} value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="flex-1 accent-primary" />
                <span className="w-28 text-right font-mono tabular text-[13px] text-text-primary">{durationText(minutes)}</span>
              </div>
              <p className="mt-2 text-[12px] text-text-muted tabular">
                Jam pertama {rupiah(active.firstHourPrice)}
                {blocks > 0 && `, lalu ${blocks} blok ${block} menit dari tarif ${rupiah(active.nextHoursPrice)} per jam`}
                . Naik ke {rupiah(bill.nextTotal)} dalam {Math.ceil(bill.secondsToNext / 60)} menit.
              </p>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-text-muted">Tagihan</div>
              <div className="font-mono tabular text-[28px] font-semibold tracking-[-0.02em] text-text-primary">{rupiah(bill.total)}</div>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
};

// ---------- Paket prabayar ----------

type PackageForm = { id: string | null; name: string; category: Category; price: string; hours: string; minutes: string; start: string; end: string; popular: boolean };

const PackageModal: React.FC<{ initial: PackageForm; takenNames: string[]; onClose: () => void; onSave: (pkg: BillingPackage) => void }> = ({ initial, takenNames, onClose, onSave }) => {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof PackageForm | 'duration', string>>>({});
  const set = (patch: Partial<PackageForm>) => setForm(f => ({ ...f, ...patch }));
  const isHappyHour = form.category === 'Happy Hour';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const price = numberOr(form.price, -1);
    const hours = numberOr(form.hours, 0);
    const mins = numberOr(form.minutes, 0);
    const total = Math.round(hours) * 60 + Math.round(mins);
    const next: typeof errors = {};
    if (!name) next.name = 'Nama paket wajib diisi.';
    // The engine finds packages by name, so two packages may not share one.
    else if (takenNames.includes(name.toLowerCase())) next.name = 'Sudah ada paket dengan nama ini.';
    if (price < 0) next.price = 'Isi harga 0 atau lebih.';
    if (hours < 0 || mins < 0 || mins > 59) next.duration = 'Jam minimal 0, menit 0 sampai 59.';
    else if (total <= 0) next.duration = 'Durasi harus lebih dari 0 menit.';
    if (isHappyHour && (!form.start || !form.end)) next.start = 'Isi jam mulai dan jam selesai.';
    setErrors(next);
    if (Object.keys(next).length) return;

    onSave({
      id: form.id || `pkg-${Date.now()}`,
      name,
      time: `${total >= 60 ? `${Math.floor(total / 60)}j ` : ''}${total % 60}m`,
      minutes: total,
      price: Math.round(price),
      category: form.category,
      isExtensionOnly: form.category === 'Tambah Waktu',
      popular: form.popular,
      happyHourStart: isHappyHour ? form.start : undefined,
      happyHourEnd: isHappyHour ? form.end : undefined,
    });
  };

  return (
    <Modal title={form.id ? 'Ubah Paket' : 'Tambah Paket'} onClose={onClose} width={480}>
      <form onSubmit={submit} className="p-4 space-y-3" noValidate>
        <Field label="Nama paket" htmlFor="pkg-name" hint="Tampil di kasir dan struk." error={errors.name}>
          <input id="pkg-name" autoFocus className={INPUT} value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Contoh: Paket 3 Jam" />
        </Field>
        <Field label="Kategori" htmlFor="pkg-category" hint={CATEGORIES.find(c => c.id === form.category)?.hint}>
          <select id="pkg-category" className={INPUT} value={form.category} onChange={e => set({ category: e.target.value as Category })}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Harga (Rp)" htmlFor="pkg-price" error={errors.price}>
            <input id="pkg-price" type="number" min={0} step={500} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={form.price} onChange={e => set({ price: e.target.value })} />
          </Field>
          <Field label="Jam" htmlFor="pkg-hours" error={errors.duration}>
            <input id="pkg-hours" type="number" min={0} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={form.hours} onChange={e => set({ hours: e.target.value })} />
          </Field>
          <Field label="Menit" htmlFor="pkg-minutes">
            <input id="pkg-minutes" type="number" min={0} max={59} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={form.minutes} onChange={e => set({ minutes: e.target.value })} />
          </Field>
        </div>
        {isHappyHour && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dijual mulai" htmlFor="pkg-start" error={errors.start} hint="Boleh lewat tengah malam, misal 22.00 sampai 06.00.">
              <input id="pkg-start" type="time" className={cn(INPUT, 'font-mono')} value={form.start} onChange={e => set({ start: e.target.value })} />
            </Field>
            <Field label="Sampai" htmlFor="pkg-end">
              <input id="pkg-end" type="time" className={cn(INPUT, 'font-mono')} value={form.end} onChange={e => set({ end: e.target.value })} />
            </Field>
          </div>
        )}
        <label className="flex items-center gap-2 text-[13px] text-text-primary cursor-pointer">
          <input type="checkbox" className="accent-primary w-4 h-4" checked={form.popular} onChange={e => set({ popular: e.target.checked })} />
          Tandai populer di daftar Beli Paket
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Batal</button>
          <button type="submit" className={BTN_PRIMARY}>Simpan</button>
        </div>
      </form>
    </Modal>
  );
};

const PackageSection: React.FC<{
  packages: BillingPackage[];
  canEdit: boolean;
  onEdit: (form: PackageForm) => void;
  onDelete: (pkg: BillingPackage) => void;
}> = ({ packages, canEdit, onEdit, onDelete }) => {
  const [filter, setFilter] = useState<Category | 'Semua'>('Semua');
  const [query, setQuery] = useState('');
  const now = new Date();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return packages.filter(p => (filter === 'Semua' || categoryOf(p) === filter)
      && (!q || p.name.toLowerCase().includes(q) || String(p.price).includes(q)));
  }, [packages, filter, query]);

  const chips: Array<{ id: Category | 'Semua'; label: string; count: number }> = [
    { id: 'Semua', label: 'Semua', count: packages.length },
    ...CATEGORIES.map(c => ({ id: c.id, label: c.label, count: packages.filter(p => categoryOf(p) === c.id).length })),
  ];

  const blank: PackageForm = {
    id: null, name: '', category: filter === 'Semua' ? 'Jam' : filter, price: '4000', hours: '1', minutes: '0', start: '22:00', end: '06:00', popular: false,
  };

  return (
    <Panel
      title="Paket prabayar"
      description="Paket yang dibayar di muka. Dijual lewat Beli Paket di kartu PC dan menu klik kanan grid."
      action={canEdit && (
        <button type="button" className={BTN_PRIMARY} onClick={() => onEdit(blank)}>
          <Plus className="w-4 h-4" aria-hidden /> Tambah Paket
        </button>
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div role="group" aria-label="Saring kategori paket" className="flex flex-wrap gap-1">
          {chips.map(c => {
            const on = filter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(c.id)}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-sm text-[12px] transition-colors duration-150 ${FOCUS} ${on ? 'bg-surface-3 text-text-primary shadow-[inset_0_0_0_1px_rgb(var(--gc-hairline-strong))]' : 'text-text-muted hover:text-text-primary'}`}
              >
                {c.label}
                <span className="font-mono text-[11px] opacity-80">{c.count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <div className="relative w-56">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
          <label htmlFor="pkg-search" className="sr-only">Cari paket</label>
          <input id="pkg-search" className={cn(INPUT, 'h-8 pl-8')} value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama atau harga" />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-text-muted">
          {query.trim()
            ? `Tidak ada paket yang cocok dengan "${query.trim()}".`
            : filter === 'Semua'
              ? 'Belum ada paket. Tambah paket dari tombol di kanan atas.'
              : `Belum ada paket ${categoryLabel(filter as Category)}. Tambah dari tombol di kanan atas.`}
        </p>
      ) : (
        <table className="w-full border-collapse">
          <thead className="border-b border-hairline">
            <tr>
              <th className={TH}>Nama</th>
              <th className={TH}>Kategori</th>
              <th className={`${TH} text-right`}>Durasi</th>
              <th className={`${TH} text-right`}>Harga</th>
              <th className={TH}>Jam jual</th>
              {canEdit && <th className={TH}><span className="sr-only">Aksi</span></th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(pkg => {
              const cat = categoryOf(pkg);
              const hasWindow = cat === 'Happy Hour' && pkg.happyHourStart && pkg.happyHourEnd;
              const onSale = isPackageOnSale(pkg, now);
              return (
                <tr key={pkg.id} className="border-b border-hairline last:border-b-0">
                  <td className={TD}>
                    <span className="font-medium text-text-primary">{pkg.name}</span>
                    {pkg.popular && <span className="ml-2 inline-flex items-center h-5 px-1.5 rounded-xs text-[11px] font-semibold bg-primary/15 text-primary">Populer</span>}
                  </td>
                  <td className={`${TD} text-text-secondary`}>{categoryLabel(cat)}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-secondary`}>{durationText(pkg.minutes)}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-primary`}>{rupiah(pkg.price)}</td>
                  <td className={`${TD} text-[12px]`}>
                    {hasWindow ? (
                      <span className="inline-flex items-center gap-1.5 tabular">
                        <span className={`w-1.5 h-1.5 rounded-full ${onSale ? 'bg-primary' : 'bg-text-disabled'}`} aria-hidden />
                        <span className={onSale ? 'text-text-primary' : 'text-text-muted'}>{saleWindowText(pkg)}</span>
                        <span className="sr-only">{onSale ? ', dijual sekarang' : ', di luar jam jual'}</span>
                      </span>
                    ) : (
                      <span className="text-text-muted">Kapan saja</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <button type="button" className={cn(BTN_GHOST, 'text-text-secondary hover:text-text-primary hover:bg-surface-3')}
                        onClick={() => onEdit({
                          id: pkg.id, name: pkg.name, category: cat, price: String(pkg.price),
                          hours: String(Math.floor(pkg.minutes / 60)), minutes: String(pkg.minutes % 60),
                          start: pkg.happyHourStart || '22:00', end: pkg.happyHourEnd || '06:00', popular: !!pkg.popular,
                        })}>
                        Ubah
                      </button>
                      <button type="button" className={cn(BTN_GHOST, 'text-error hover:bg-error/10')} onClick={() => onDelete(pkg)}>Hapus</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
};

// ---------- Aturan billing ----------

interface Rules { roundingStep: RoundingStep; penalty: string; stacking: boolean; grace: string }

const RulesSection: React.FC<{ canEdit: boolean; onSaved: (rules: Rules) => void; onTriggerToast?: PackagePricingViewProps['onTriggerToast'] }> = ({ canEdit, onSaved, onTriggerToast }) => {
  const [rules, setRules] = useState<Rules | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<{ field?: 'penalty' | 'grace'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const get = (key: string) => api()?.getSetting?.(key) as Promise<string | undefined>;
      const [step, penalty, stacking, grace] = await Promise.all([
        get('cashierRoundingStep'), get('refundPenaltyPercent'), get('allowStackedPackages'), get('autoCutoffToleranceSec'),
      ]);
      setRules({
        roundingStep: normalizeRoundingStep(step),
        penalty: penalty && penalty.trim() !== '' ? penalty : '50',
        stacking: stacking !== 'false',
        grace: grace && grace.trim() !== '' ? grace : '0',
      });
    } catch {
      setLoadError('Aturan billing gagal dibaca dari database.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loadError) return <Panel title="Aturan billing"><ErrorLine message={loadError} onRetry={load} /></Panel>;
  if (!rules) return <Panel title="Aturan billing"><SkeletonRows rows={4} /></Panel>;

  const set = (patch: Partial<Rules>) => setRules({ ...rules, ...patch });
  const penalty = numberOr(rules.penalty, -1);
  const grace = numberOr(rules.grace, -1);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isInteger(penalty) || penalty < 0 || penalty > 100) return setError({ field: 'penalty', message: 'Isi 0 sampai 100.' });
    if (!Number.isInteger(grace) || grace < 0 || grace > 60) return setError({ field: 'grace', message: 'Isi 0 sampai 60 detik.' });

    setSaving(true);
    const results = await Promise.all([
      api()?.saveSetting?.('cashierRoundingStep', String(rules.roundingStep)),
      api()?.saveSetting?.('refundPenaltyPercent', String(penalty)),
      api()?.saveSetting?.('allowStackedPackages', String(rules.stacking)),
      api()?.saveSetting?.('autoCutoffToleranceSec', String(grace)),
    ]);
    setSaving(false);
    const fail = results.find(denied);
    if (fail) return setError({ message: fail.message || 'Aturan billing gagal disimpan.' });

    setError(null);
    onSaved(rules);
    onTriggerToast?.('Aturan Billing Disimpan', 'Berlaku untuk tagihan dan sesi berikutnya yang dihitung server.');
  };

  const exampleBill = 5750;
  const exampleRefund = 10000 * (1 - Math.max(0, Math.min(100, penalty)) / 100);

  return (
    <Panel title="Aturan billing" description="Dibaca engine billing di server setiap kali menghitung tagihan, refund, dan waktu habis.">
      <form onSubmit={save} noValidate>
        <fieldset disabled={!canEdit} className="space-y-5 min-w-0">
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-text-secondary" id="rounding-label">Pembulatan kasir</p>
            <div role="radiogroup" aria-labelledby="rounding-label" className="flex flex-wrap gap-2">
              {([100, 500, 1000] as RoundingStep[]).map(step => (
                <label key={step} className={`flex items-center gap-2 h-9 px-3 rounded-sm border text-[13px] cursor-pointer ${rules.roundingStep === step ? 'border-primary bg-primary/10 text-text-primary' : 'border-hairline text-text-secondary hover:border-hairline-strong'}`}>
                  <input type="radio" name="rounding-step" className="accent-primary" checked={rules.roundingStep === step} onChange={() => set({ roundingStep: step })} />
                  <span className="font-mono tabular">Rp {step.toLocaleString('id-ID')}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[12px] text-text-muted tabular">
              Tagihan personal dibulatkan ke atas, uang refund ke bawah. Contoh: tagihan {rupiah(exampleBill)} jadi {rupiah(Math.ceil(exampleBill / rules.roundingStep) * rules.roundingStep)}, refund {rupiah(exampleBill)} jadi {rupiah(roundDownToStep(exampleBill, rules.roundingStep))}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <Field
              label="Penalti refund sisa waktu (%)"
              htmlFor="rule-penalty"
              error={error?.field === 'penalty' ? error.message : undefined}
              hint={penalty >= 0 && penalty <= 100 ? `Sisa senilai Rp 10.000 dikembalikan sekitar ${rupiah(exampleRefund)}.` : undefined}
            >
              <input id="rule-penalty" type="number" min={0} max={100} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={rules.penalty} onChange={e => set({ penalty: e.target.value })} />
            </Field>
            <Field
              label="Toleransi waktu habis (detik)"
              htmlFor="rule-grace"
              error={error?.field === 'grace' ? error.message : undefined}
              hint="Waktu di 00:00 sebelum PC dikunci. 0 berarti langsung."
            >
              <input id="rule-grace" type="number" min={0} max={60} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={rules.grace} onChange={e => set({ grace: e.target.value })} />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer max-w-xl">
            <input type="checkbox" className="accent-primary w-4 h-4 mt-0.5" checked={rules.stacking} onChange={e => set({ stacking: e.target.checked })} />
            <span>
              <span className="block text-[13px] font-medium text-text-primary">Antrian paket</span>
              <span className="block text-[12px] text-text-muted">
                {rules.stacking
                  ? 'Paket yang dibeli saat sesi berjalan masuk antrian dan aktif otomatis setelah paket sekarang habis.'
                  : 'Paket yang dibeli saat sesi berjalan langsung menambah waktu paket sekarang, tanpa antrian.'}
              </span>
            </span>
          </label>
        </fieldset>
        {error && !error.field && <p role="alert" className="mt-3 text-[12px] text-error">{error.message}</p>}
        {canEdit && (
          <div className="mt-5">
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? 'Menyimpan...' : 'Simpan Aturan'}</button>
          </div>
        )}
      </form>
    </Panel>
  );
};

// ---------- Page ----------

type PendingDelete = { kind: 'rate'; item: PersonalRateConfig } | { kind: 'package'; item: BillingPackage };

export const PackagePricingView: React.FC<PackagePricingViewProps> = ({
  packages = [],
  personalRates = [],
  activePersonalRateId,
  onUpdatePackages,
  onUpdatePersonalRates,
  onSelectActivePersonalRate,
  canEdit,
  onTriggerToast,
}) => {
  const [section, setSection] = useState<Section>('personal');
  const [roundingStep, setRoundingStep] = useState<RoundingStep>(100);
  const [rateForm, setRateForm] = useState<RateForm | null>(null);
  const [packageForm, setPackageForm] = useState<PackageForm | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  useEffect(() => {
    api()?.getSetting?.('cashierRoundingStep').then((v: string) => setRoundingStep(normalizeRoundingStep(v))).catch(() => {});
  }, []);

  const toast = (title: string, message: string) => onTriggerToast?.(title, message);

  const saveRate = async (rate: PersonalRateConfig) => {
    const exists = personalRates.some(r => r.id === rate.id);
    const next = exists ? personalRates.map(r => (r.id === rate.id ? rate : r)) : [...personalRates, rate];
    setRateForm(null);
    if ((await onUpdatePersonalRates(next)) !== false) toast('Tarif Disimpan', `Tarif ${rate.name} tersimpan.`);
  };

  const savePackage = async (pkg: BillingPackage) => {
    const exists = packages.some(p => p.id === pkg.id);
    const next = exists ? packages.map(p => (p.id === pkg.id ? pkg : p)) : [...packages, pkg];
    setPackageForm(null);
    if ((await onUpdatePackages(next)) !== false) toast('Paket Disimpan', `Paket ${pkg.name} tersimpan.`);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'package') {
      const { item } = pendingDelete;
      if ((await onUpdatePackages(packages.filter(p => p.id !== item.id))) !== false) toast('Paket Dihapus', `Paket ${item.name} dihapus.`);
      return;
    }
    const { item } = pendingDelete;
    const remaining = personalRates.filter(r => r.id !== item.id);
    if ((await onUpdatePersonalRates(remaining)) === false) return;
    if (item.id === activePersonalRateId && remaining[0]) onSelectActivePersonalRate(remaining[0].id);
    toast('Tarif Dihapus', `Tarif ${item.name} dihapus.`);
  };

  const askDeleteRate = (rate: PersonalRateConfig) => {
    if (personalRates.length <= 1) {
      toast('Tarif Tidak Bisa Dihapus', 'Minimal harus ada satu tarif personal supaya kasir bisa membuka sesi personal.');
      return;
    }
    setPendingDelete({ kind: 'rate', item: rate });
  };

  return (
    <div className="px-6 py-5 max-w-5xl space-y-4">
      {!canEdit && <ReadOnlyNote />}

      <div role="group" aria-label="Bagian tarif" className="inline-flex p-0.5 rounded-sm bg-surface-2 border border-hairline">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            aria-pressed={section === s.id}
            onClick={() => setSection(s.id)}
            className={`h-8 px-3 rounded-xs text-[13px] font-medium transition-colors duration-150 ${FOCUS} ${section === s.id ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'personal' && (
        <PersonalSection
          rates={personalRates}
          activeId={activePersonalRateId}
          canEdit={canEdit}
          roundingStep={roundingStep}
          onSelect={onSelectActivePersonalRate}
          onEdit={setRateForm}
          onDelete={askDeleteRate}
        />
      )}
      {section === 'paket' && (
        <PackageSection packages={packages} canEdit={canEdit} onEdit={setPackageForm} onDelete={pkg => setPendingDelete({ kind: 'package', item: pkg })} />
      )}
      {section === 'pc' && <PcRateSection canEdit={canEdit} onTriggerToast={onTriggerToast} />}
      {section === 'aturan' && (
        <RulesSection canEdit={canEdit} onSaved={r => setRoundingStep(r.roundingStep)} onTriggerToast={onTriggerToast} />
      )}

      {rateForm && <RateModal initial={rateForm} onClose={() => setRateForm(null)} onSave={saveRate} />}
      {packageForm && (
        <PackageModal
          initial={packageForm}
          takenNames={packages.filter(p => p.id !== packageForm.id).map(p => p.name.toLowerCase())}
          onClose={() => setPackageForm(null)}
          onSave={savePackage}
        />
      )}

      <ConfirmModal
        isOpen={!!pendingDelete}
        title={pendingDelete?.kind === 'rate' ? 'Hapus Tarif Personal' : 'Hapus Paket'}
        description={`Hapus ${pendingDelete?.kind === 'rate' ? 'tarif' : 'paket'} ${pendingDelete?.item.name ?? ''}?`}
        detail={pendingDelete?.kind === 'rate'
          ? 'Sesi personal yang sedang berjalan tetap memakai tarif lamanya sampai selesai.'
          : 'Paket hilang dari daftar Beli Paket. Sesi yang sudah membeli paket ini tidak berubah.'}
        iconType="danger"
        confirmText="Hapus"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
};
