import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Search } from 'lucide-react';
import { api, INPUT, BTN_PRIMARY, BTN_SECONDARY, BTN_GHOST, FOCUS, Field, ErrorLine, TH, TD, Modal } from '../../shared/ui/primitives';
import { rupiah } from './PcCard';
import { cn } from '../../shared/ui/utils';

// Kelola Produk F&B (tab POS). Fastest entry: one row, Enter to save, cursor back on the name.
// Categories are typed by name and created on the fly. Admins add and edit; any logged-in
// cashier can add stock. The same catalog feeds the booth order menu (sync_catalog).

interface Product {
  id: number;
  categoryName: string;
  name: string;
  unitPrice: number;
  stock: number;
  alertStock: number;
  unitName: string;
  enabled: boolean;
}

type Form = { id?: number; name: string; categoryName: string; unitPrice: string; stock: string; unitName: string; alertStock: string; enabled: boolean };

const toPayload = (f: Form) => ({
  id: f.id,
  name: f.name,
  categoryName: f.categoryName,
  unitPrice: f.unitPrice.trim() === '' ? NaN : Number(f.unitPrice),
  stock: f.stock.trim() === '' ? 0 : Number(f.stock),
  unitName: f.unitName,
  alertStock: f.alertStock.trim() === '' ? 5 : Number(f.alertStock),
  enabled: f.enabled,
});

const EditModal: React.FC<{ initial: Form; categories: string[]; onClose: () => void; onSaved: (msg: string) => void }> = ({ initial, categories, onClose, onSaved }) => {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await api()?.savePosProduct?.(toPayload(form));
    setSaving(false);
    if (!res?.success) return setError(res?.message || 'Produk gagal disimpan.');
    onSaved(res.message);
  };

  return (
    <Modal title={`Ubah ${initial.name}`} onClose={onClose} width={460}>
      <form onSubmit={submit} className="p-4 space-y-3" noValidate>
        <Field label="Nama" htmlFor="edit-name"><input id="edit-name" autoFocus className={INPUT} value={form.name} onChange={e => set({ name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kategori" htmlFor="edit-cat">
            <input id="edit-cat" list="product-categories" className={INPUT} value={form.categoryName} onChange={e => set({ categoryName: e.target.value })} />
          </Field>
          <Field label="Harga jual (Rp)" htmlFor="edit-price">
            <input id="edit-price" type="number" min={0} step={500} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={form.unitPrice} onChange={e => set({ unitPrice: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Stok" htmlFor="edit-stock" hint="Koreksi hitung fisik.">
            <input id="edit-stock" type="number" min={0} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={form.stock} onChange={e => set({ stock: e.target.value })} />
          </Field>
          <Field label="Satuan" htmlFor="edit-unit">
            <input id="edit-unit" className={INPUT} value={form.unitName} onChange={e => set({ unitName: e.target.value })} placeholder="pcs" />
          </Field>
          <Field label="Menipis di" htmlFor="edit-alert">
            <input id="edit-alert" type="number" min={0} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={form.alertStock} onChange={e => set({ alertStock: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-text-primary cursor-pointer">
          <input type="checkbox" className="accent-primary w-4 h-4" checked={form.enabled} onChange={e => set({ enabled: e.target.checked })} />
          Dijual, tampil di kasir dan menu Pesan bilik
        </label>
        <datalist id="product-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
        {error && <p role="alert" className="text-[12px] text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Batal</button>
          <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  );
};

const RestockCell: React.FC<{ product: Product; onDone: (ok: boolean, msg: string) => void }> = ({ product, onDone }) => {
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qty.trim()) return;
    setBusy(true);
    const res = await api()?.restockPosProduct?.({ productId: product.id, addedStock: Number(qty) });
    setBusy(false);
    if (res?.success) setQty('');
    onDone(!!res?.success, res?.message || 'Stok gagal ditambah.');
  };
  return (
    <form onSubmit={submit} className="flex items-center justify-end gap-1">
      <label htmlFor={`restock-${product.id}`} className="sr-only">Tambah stok {product.name}</label>
      <input id={`restock-${product.id}`} type="number" min={1} inputMode="numeric" placeholder="+0" value={qty} onChange={e => setQty(e.target.value)} className={cn(INPUT, 'h-8 w-16 px-2 text-right font-mono tabular')} />
      <button type="submit" disabled={busy || !qty.trim()} aria-label={`Simpan tambah stok ${product.name}`} className={`w-8 h-8 flex items-center justify-center rounded-sm text-primary hover:bg-primary/10 disabled:opacity-40 ${FOCUS}`}>
        <Plus className="w-4 h-4" aria-hidden />
      </button>
    </form>
  );
};

export const ProductManager: React.FC<{ isAdmin: boolean; onToast: (title: string, message: string) => void }> = ({ isAdmin, onToast }) => {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState<Form>({ name: '', categoryName: '', unitPrice: '', stock: '', unitName: 'pcs', alertStock: '5', enabled: true });
  const [quickError, setQuickError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Form | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api()?.getPosProducts?.();
      setProducts(Array.isArray(list) ? list : []);
    } catch {
      setLoadError('Daftar produk gagal dimuat dari database.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => Array.from(new Set((products || []).map(p => p.categoryName))).sort(), [products]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products || [])
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.categoryName.localeCompare(b.categoryName) || a.name.localeCompare(b.name));
  }, [products, query]);

  const quickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    const res = await api()?.savePosProduct?.(toPayload(quick));
    setAdding(false);
    if (!res?.success) return setQuickError(res?.message || 'Produk gagal disimpan.');
    setQuickError(null);
    // Keep the category: products are usually entered a category at a time.
    setQuick(q => ({ ...q, name: '', unitPrice: '', stock: '' }));
    onToast('Produk Ditambah', res.message);
    await load();
    nameRef.current?.focus();
  };

  const toggle = async (p: Product) => {
    const res = await api()?.savePosProduct?.({ ...p, enabled: !p.enabled });
    if (!res?.success) return onToast('Gagal', res?.message || 'Produk gagal diubah.');
    onToast(p.enabled ? 'Produk Tidak Dijual' : 'Produk Dijual Lagi', p.name);
    load();
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 pb-6 space-y-4">
      {isAdmin ? (
        <form onSubmit={quickAdd} noValidate className="p-3 rounded-md border border-hairline bg-surface-2">
          <div className="grid grid-cols-[2fr_1.3fr_1fr_0.8fr_auto] gap-2 items-end">
            <div>
              <label htmlFor="quick-name" className="block mb-1 text-[12px] font-medium text-text-secondary">Nama produk</label>
              <input id="quick-name" ref={nameRef} autoFocus className={INPUT} value={quick.name} onChange={e => setQuick({ ...quick, name: e.target.value })} placeholder="Es Teh Manis" />
            </div>
            <div>
              <label htmlFor="quick-cat" className="block mb-1 text-[12px] font-medium text-text-secondary">Kategori</label>
              <input id="quick-cat" list="quick-categories" className={INPUT} value={quick.categoryName} onChange={e => setQuick({ ...quick, categoryName: e.target.value })} placeholder="Minuman" />
              <datalist id="quick-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label htmlFor="quick-price" className="block mb-1 text-[12px] font-medium text-text-secondary">Harga (Rp)</label>
              <input id="quick-price" type="number" min={0} step={500} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={quick.unitPrice} onChange={e => setQuick({ ...quick, unitPrice: e.target.value })} placeholder="3000" />
            </div>
            <div>
              <label htmlFor="quick-stock" className="block mb-1 text-[12px] font-medium text-text-secondary">Stok</label>
              <input id="quick-stock" type="number" min={0} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={quick.stock} onChange={e => setQuick({ ...quick, stock: e.target.value })} placeholder="0" />
            </div>
            <button type="submit" disabled={adding} className={BTN_PRIMARY}>
              <Plus className="w-4 h-4" aria-hidden /> Tambah
            </button>
          </div>
          <p className={`mt-2 text-[12px] ${quickError ? 'text-error' : 'text-text-muted'}`} role={quickError ? 'alert' : undefined}>
            {quickError || 'Tekan Enter untuk menyimpan. Kategori baru dibuat otomatis dari namanya.'}
          </p>
        </form>
      ) : (
        <p className="px-3 py-2 rounded-sm border border-warning/40 bg-warning/10 text-[13px] text-text-primary">
          Hanya admin yang bisa menambah atau mengubah produk. Kasir bisa menambah stok di kolom paling kanan.
        </p>
      )}

      <div className="flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Produk</h2>
        {products && <span className="text-[12px] text-text-muted">{products.filter(p => p.enabled).length} dijual, {products.filter(p => !p.enabled).length} tidak dijual</span>}
        <div className="flex-1" />
        <div className="relative w-56">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
          <label htmlFor="product-search" className="sr-only">Cari produk</label>
          <input id="product-search" className={cn(INPUT, 'h-8 pl-8')} value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama atau kategori" />
        </div>
      </div>

      {loadError ? (
        <ErrorLine message={loadError} onRetry={load} />
      ) : products === null ? (
        <div className="space-y-2" aria-busy aria-label="Memuat produk">{[0, 1, 2, 3].map(i => <div key={i} className="h-10 rounded-sm bg-surface-3 animate-pulse" />)}</div>
      ) : products.length === 0 ? (
        <p className="text-[13px] text-text-muted">{isAdmin ? 'Belum ada produk. Isi baris di atas lalu tekan Enter.' : 'Belum ada produk. Minta admin menambahkannya.'}</p>
      ) : visible.length === 0 ? (
        <p className="text-[13px] text-text-muted">Tidak ada produk yang cocok.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead className="border-b border-hairline">
            <tr>
              <th className={TH}>Nama</th>
              <th className={TH}>Kategori</th>
              <th className={`${TH} text-right`}>Harga</th>
              <th className={`${TH} text-right`}>Stok</th>
              <th className={`${TH} text-right`}>Tambah stok</th>
              {isAdmin && <th className={TH}><span className="sr-only">Aksi</span></th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(p => {
              const low = p.stock <= p.alertStock;
              return (
                <tr key={p.id} className={`border-b border-hairline last:border-b-0 ${p.enabled ? '' : 'opacity-60'}`}>
                  <td className={`${TD} text-text-primary`}>
                    {p.name}
                    {!p.enabled && <span className="ml-2 text-[12px] text-text-muted">tidak dijual</span>}
                  </td>
                  <td className={`${TD} text-text-secondary`}>{p.categoryName}</td>
                  <td className={`${TD} text-right font-mono tabular text-text-primary`}>{rupiah(p.unitPrice)}</td>
                  <td className={`${TD} text-right font-mono tabular ${p.stock <= 0 ? 'text-error' : low ? 'text-warning' : 'text-text-primary'}`}>
                    {p.stock} <span className="font-sans text-[12px] text-text-muted">{p.unitName}</span>
                  </td>
                  <td className={TD}>
                    <RestockCell product={p} onDone={(ok, msg) => { onToast(ok ? 'Stok Ditambah' : 'Stok Gagal Ditambah', msg); if (ok) load(); }} />
                  </td>
                  {isAdmin && (
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <button type="button" className={cn(BTN_GHOST, 'text-text-secondary hover:text-text-primary hover:bg-surface-3')}
                        onClick={() => setEditing({ id: p.id, name: p.name, categoryName: p.categoryName, unitPrice: String(p.unitPrice), stock: String(p.stock), unitName: p.unitName, alertStock: String(p.alertStock), enabled: p.enabled })}>
                        Ubah
                      </button>
                      <button type="button" className={cn(BTN_GHOST, 'text-text-secondary hover:text-text-primary hover:bg-surface-3')} onClick={() => toggle(p)}>
                        {p.enabled ? 'Stop jual' : 'Jual lagi'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <EditModal
          initial={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); onToast('Produk Disimpan', msg); load(); }}
        />
      )}
    </div>
  );
};

