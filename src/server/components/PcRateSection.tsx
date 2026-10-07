import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Workstation } from '../../shared/types';
import { cn } from '../../shared/ui/utils';
import { rupiah } from './PcCard';
import { api, denied, INPUT, BTN_PRIMARY, BTN_SECONDARY, Panel, ErrorLine, SkeletonRows, TH, TD } from '../../shared/ui/primitives';

type Draft = { groupName: string; price: string };

const byName = (a: Workstation, b: Workstation) => a.name.localeCompare(b.name, 'id', { numeric: true });
const validPrice = (v: string) => Number(v) > 0 && Number(v) <= 1_000_000;

// Member balance is charged at the rate of the PC the member plays on (main/index.ts getWorkstationRate).
export const PcRateSection: React.FC<{ canEdit: boolean; onTriggerToast?: (title: string, message: string) => void }> = ({ canEdit, onTriggerToast }) => {
  const [pcs, setPcs] = useState<Workstation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [bulkGroup, setBulkGroup] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api()?.getWorkstations?.();
      setPcs(Array.isArray(list) ? [...list].sort(byName) : []);
      setDrafts({});
    } catch {
      setLoadError('Daftar PC gagal dimuat dari database.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => Array.from(new Set((pcs || []).map(p => p.groupName).filter(Boolean))).sort(), [pcs]);
  useEffect(() => { if (!bulkGroup && groups[0]) setBulkGroup(groups[0]); }, [groups, bulkGroup]);

  const valueOf = (pc: Workstation): Draft => drafts[pc.id] ?? { groupName: pc.groupName, price: String(pc.pricePerHour ?? 4000) };
  const changed = (pcs || []).filter(pc => {
    const d = drafts[pc.id];
    return d && (d.groupName.trim() !== pc.groupName || Number(d.price) !== Number(pc.pricePerHour));
  });
  const invalid = changed.some(pc => !validPrice(drafts[pc.id].price) || !drafts[pc.id].groupName.trim());

  const setDraft = (pc: Workstation, patch: Partial<Draft>) => {
    setSaveError(null);
    setDrafts(prev => ({ ...prev, [pc.id]: { ...valueOf(pc), ...patch } }));
  };

  const applyToGroup = () => {
    if (!validPrice(bulkPrice)) return setSaveError('Isi tarif lebih dari Rp 0 untuk diterapkan ke grup.');
    setSaveError(null);
    setDrafts(prev => {
      const next = { ...prev };
      for (const pc of pcs || []) {
        const current = next[pc.id] ?? valueOf(pc);
        if (current.groupName.trim() === bulkGroup) next[pc.id] = { ...current, price: bulkPrice };
      }
      return next;
    });
  };

  const save = async () => {
    if (!changed.length || invalid || saving) return;
    setSaving(true);
    setSaveError(null);
    const items = changed.map(pc => ({ id: pc.id, groupName: drafts[pc.id].groupName.trim(), pricePerHour: Number(drafts[pc.id].price) }));
    try {
      const res = await api()?.updateWorkstationSettings?.(items);
      if (!res || denied(res) || !res.success) {
        setSaveError(res?.message || 'Perubahan gagal disimpan.');
        return;
      }
      onTriggerToast?.('Tarif PC Disimpan', res.message);
      await load();
    } catch {
      setSaveError('Perubahan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const panel = (body: React.ReactNode) => (
    <Panel
      title="Tarif member per PC"
      description="Saldo member dipotong pakai tarif PC tempat dia main. Perubahan berlaku untuk sesi member berikutnya, sesi yang sedang jalan tetap memakai tarif awalnya."
    >
      {body}
    </Panel>
  );

  if (loadError) return panel(<ErrorLine message={loadError} onRetry={load} />);
  if (!pcs) return panel(<SkeletonRows rows={4} />);
  if (pcs.length === 0) return panel(<p className="text-[13px] text-text-muted">Belum ada PC. Tambah PC dari denah di halaman utama, lalu atur tarifnya di sini.</p>);

  return panel(
    <div className="space-y-3">
      {canEdit && groups.length > 0 && (
        <div role="group" aria-label="Atur tarif satu grup" className="flex flex-wrap items-end gap-2 p-3 rounded-sm bg-surface-1 border border-hairline">
          <div>
            <label htmlFor="bulk-group" className="block mb-1 text-[12px] font-medium text-text-secondary">Grup</label>
            <select id="bulk-group" value={bulkGroup} onChange={e => setBulkGroup(e.target.value)} className={cn(INPUT, 'w-[180px]')}>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bulk-price" className="block mb-1 text-[12px] font-medium text-text-secondary">Tarif per jam</label>
            <input id="bulk-price" type="number" min={500} step={500} value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} placeholder="6000" className={cn(INPUT, 'w-[130px] font-mono tabular')} />
          </div>
          <button type="button" onClick={applyToGroup} className={BTN_SECONDARY}>Terapkan ke grup</button>
          <p className="basis-full text-[12px] text-text-muted">Mengisi tabel di bawah. Belum tersimpan sampai kamu tekan Simpan.</p>
        </div>
      )}

      <table className="w-full border-collapse">
        <thead className="border-b border-hairline">
          <tr>
            <th className={TH}>PC</th>
            <th className={TH}>Grup</th>
            <th className={`${TH} text-right`}>Tarif member per jam</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {pcs.map(pc => {
            const v = valueOf(pc);
            const isChanged = changed.includes(pc);
            const badPrice = isChanged && !validPrice(v.price);
            const badGroup = isChanged && !v.groupName.trim();
            return (
              <tr key={pc.id} className={isChanged ? 'bg-primary/5' : undefined}>
                <td className={`${TD} font-mono font-medium text-text-primary whitespace-nowrap`}>
                  {pc.name}
                  {isChanged && <span className="ml-2 font-sans text-[11px] font-normal text-primary">diubah</span>}
                </td>
                <td className={TD}>
                  {canEdit ? (
                    <input
                      aria-label={`Grup ${pc.name}`}
                      aria-invalid={badGroup || undefined}
                      list="pc-rate-groups"
                      maxLength={32}
                      value={v.groupName}
                      onChange={e => setDraft(pc, { groupName: e.target.value })}
                      className={cn(INPUT, 'h-8 w-[200px]', badGroup && 'border-error')}
                    />
                  ) : <span className="text-text-secondary">{pc.groupName}</span>}
                </td>
                <td className={`${TD} text-right`}>
                  {canEdit ? (
                    <input
                      type="number"
                      min={500}
                      step={500}
                      aria-label={`Tarif ${pc.name}`}
                      aria-invalid={badPrice || undefined}
                      value={v.price}
                      onChange={e => setDraft(pc, { price: e.target.value })}
                      className={cn(INPUT, 'h-8 w-[120px] ml-auto text-right font-mono tabular', badPrice && 'border-error')}
                    />
                  ) : <span className="font-mono tabular text-text-primary">{rupiah(Number(pc.pricePerHour) || 0)}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="pc-rate-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>

      {saveError && <p role="alert" className="text-[13px] text-error">{saveError}</p>}

      {canEdit && (
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
          <span className="mr-auto text-[12px] text-text-muted" aria-live="polite">
            {changed.length ? `${changed.length} PC diubah${invalid ? ', ada isian yang belum benar' : ''}` : 'Belum ada perubahan'}
          </span>
          <button type="button" onClick={() => { setDrafts({}); setSaveError(null); }} disabled={!changed.length || saving} className={BTN_SECONDARY}>Batal</button>
          <button type="button" onClick={save} disabled={!changed.length || invalid || saving} className={BTN_PRIMARY}>
            {saving ? 'Menyimpan' : 'Simpan'}
          </button>
        </div>
      )}
    </div>
  );
};
