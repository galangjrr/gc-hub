import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Layers } from 'lucide-react';
import { Workstation } from '../../../shared/types';
import { Modal, Field, INPUT, BTN_PRIMARY, BTN_SECONDARY, BTN_GHOST } from '../settingsUi';
import { cn } from '../../../shared/ui/utils';

type AddResult = { success: boolean; message?: string };

interface AddWorkstationModalProps {
  isOpen: boolean;
  workstations: Workstation[];
  onClose: () => void;
  onAddSingle: (data: { name: string; ip?: string; groupName?: string; pricePerHour?: number }) => Promise<AddResult>;
  onAddBatch: (params: { prefix: string; fromNum: number; toNum: number; groupName?: string; pricePerHour?: number }) => Promise<AddResult>;
}

const DEFAULT_GROUP = 'Area Reguler';
const pad = (n: number) => String(n).padStart(2, '0');

export const AddWorkstationModal: React.FC<AddWorkstationModalProps> = ({ isOpen, workstations, onClose, onAddSingle, onAddBatch }) => {
  // Groups the grid already uses, so a new PC lands in an existing one unless typed otherwise
  const groups = useMemo(() => Array.from(new Set([DEFAULT_GROUP, ...workstations.map(w => w.groupName).filter(Boolean) as string[]])), [workstations]);
  const nextNumber = useMemo(() => {
    const nums = workstations.map(w => /^PC-(\d+)$/i.exec(w.name)?.[1]).filter(Boolean).map(Number);
    return nums.length ? Math.max(...nums) + 1 : 1;
  }, [workstations]);

  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [prefix, setPrefix] = useState('PC-');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('10');
  const [group, setGroup] = useState(DEFAULT_GROUP);
  const [price, setPrice] = useState('4000');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(`PC-${pad(nextNumber)}`);
    setIp('');
    setFrom(String(nextNumber));
    setTo(String(nextNumber + 9));
    setError(null);
    setBusy(false);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const fromNum = Number(from);
  const toNum = Number(to);
  const count = Number.isInteger(fromNum) && Number.isInteger(toNum) && toNum >= fromNum ? toNum - fromNum + 1 : 0;
  const pricePerHour = Number(price);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!(pricePerHour > 0)) return setError('Tarif per jam harus lebih dari Rp 0.');
    if (mode === 'batch' && count === 0) return setError('Nomor awal harus lebih kecil atau sama dengan nomor akhir.');
    if (mode === 'batch' && count > 100) return setError('Maksimal 100 PC sekali tambah.');

    setBusy(true);
    setError(null);
    const res = mode === 'single'
      ? await onAddSingle({ name: name.trim(), ip: ip.trim() || undefined, groupName: group.trim() || DEFAULT_GROUP, pricePerHour })
      : await onAddBatch({ prefix, fromNum, toNum, groupName: group.trim() || DEFAULT_GROUP, pricePerHour });
    setBusy(false);
    if (res.success) onClose();
    else setError(res.message || 'PC gagal ditambahkan.');
  };

  const tab = (id: 'single' | 'batch', label: string, Icon: React.FC<{ className?: string }>) => (
    <button
      type="button"
      onClick={() => { setMode(id); setError(null); }}
      aria-pressed={mode === id}
      className={cn(BTN_GHOST, `${mode === id ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary'}`)}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {label}
    </button>
  );

  return (
    <Modal title="Tambah PC" onClose={onClose} width={480}>
      <form onSubmit={submit} className="p-4 space-y-4" noValidate>
        <div role="group" aria-label="Cara menambah" className="flex gap-1">
          {tab('single', 'Satu PC', Plus)}
          {tab('batch', 'Rentang nomor', Layers)}
        </div>

        {mode === 'single' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama PC" htmlFor="add-pc-name" hint="Harus sama dengan nama di client">
              <input id="add-pc-name" value={name} onChange={e => setName(e.target.value)} maxLength={24} autoFocus className={cn(INPUT, 'font-mono')} />
            </Field>
            <Field label="IP" htmlFor="add-pc-ip" hint="Opsional, diisi otomatis">
              <input id="add-pc-ip" value={ip} onChange={e => setIp(e.target.value)} placeholder="Otomatis" inputMode="decimal" className={cn(INPUT, 'font-mono')} />
            </Field>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Awalan" htmlFor="add-pc-prefix">
                <input id="add-pc-prefix" value={prefix} onChange={e => setPrefix(e.target.value)} maxLength={20} autoFocus className={cn(INPUT, 'font-mono')} />
              </Field>
              <Field label="Dari nomor" htmlFor="add-pc-from">
                <input id="add-pc-from" type="number" min={1} max={999} value={from} onChange={e => setFrom(e.target.value)} className={cn(INPUT, 'font-mono tabular')} />
              </Field>
              <Field label="Sampai nomor" htmlFor="add-pc-to">
                <input id="add-pc-to" type="number" min={1} max={999} value={to} onChange={e => setTo(e.target.value)} className={cn(INPUT, 'font-mono tabular')} />
              </Field>
            </div>
            <p className="text-[13px] text-text-secondary">
              {count > 0
                ? <>Menambah <strong className="font-mono tabular text-text-primary">{count}</strong> PC, <span className="font-mono">{prefix}{pad(fromNum)}</span> sampai <span className="font-mono">{prefix}{pad(toNum)}</span>. Nama yang sudah ada dilewati.</>
                : 'Isi rentang nomor yang valid.'}
            </p>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Grup" htmlFor="add-pc-group" hint="Pilih yang ada atau ketik grup baru">
            <input id="add-pc-group" list="add-pc-groups" value={group} onChange={e => setGroup(e.target.value)} maxLength={32} className={INPUT} />
            <datalist id="add-pc-groups">
              {groups.map(g => <option key={g} value={g} />)}
            </datalist>
          </Field>
          <Field label="Tarif member per jam" htmlFor="add-pc-price" hint="Dipakai untuk potong saldo member">
            <input id="add-pc-price" type="number" min={500} step={500} value={price} onChange={e => setPrice(e.target.value)} className={cn(INPUT, 'font-mono tabular')} />
          </Field>
        </div>

        {error && <p role="alert" className="text-[13px] text-error">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Batal</button>
          <button type="submit" disabled={busy} className={BTN_PRIMARY}>
            <Plus className="w-3.5 h-3.5" aria-hidden />
            {busy ? 'Menyimpan' : mode === 'single' ? 'Tambah PC' : `Tambah ${count} PC`}
          </button>
        </div>
      </form>
    </Modal>
  );
};
