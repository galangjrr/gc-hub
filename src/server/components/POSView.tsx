import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Minus, Search, X } from 'lucide-react';
import { api, INPUT, BTN_PRIMARY, FOCUS, ErrorLine } from '../../shared/ui/primitives';
import { rupiah } from './PcCard';
import { ProductManager } from './ProductManager';
import { cn } from '../../shared/ui/utils';

// Counter sales (walk-in customers at the cashier). The server prices the cart from the catalog,
// checks stock, deducts it and records the cash sale (DbService.counterSale).

interface Product {
  id: number;
  categoryName: string;
  name: string;
  unitPrice: number;
  stock: number;
  unitName: string;
  enabled: boolean;
}

interface POSViewProps {
  isAdmin: boolean;
  onSold: (result: { message: string; lowStockWarnings?: string[] }) => void;
  onError: (message: string) => void;
  onToast: (title: string, message: string) => void;
}

export const POSView: React.FC<POSViewProps> = ({ isAdmin, onSold, onError, onToast }) => {
  const [mode, setMode] = useState<'jual' | 'produk'>('jual');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState('Semua');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Map<number, number>>(new Map());
  const [selling, setSelling] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api()?.getPosProducts?.();
      setProducts((Array.isArray(list) ? list : []).filter((p: Product) => p.enabled));
    } catch {
      setLoadError('Katalog produk gagal dimuat dari database.');
    }
  }, []);

  // Reload when coming back from Produk: prices, stock or the product list may have changed.
  useEffect(() => { if (mode === 'jual') load(); }, [load, mode]);

  const byId = useMemo(() => new Map((products || []).map(p => [p.id, p])), [products]);
  const categories = useMemo(() => ['Semua', ...Array.from(new Set((products || []).map(p => p.categoryName)))], [products]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products || []).filter(p => (category === 'Semua' || p.categoryName === category) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, category, query]);

  const lines = Array.from(cart, ([id, qty]) => ({ product: byId.get(id)!, qty })).filter(l => l.product);
  const total = lines.reduce((sum, l) => sum + l.product.unitPrice * l.qty, 0);

  const setQty = (id: number, qty: number) => setCart(prev => {
    const next = new Map(prev);
    const stock = byId.get(id)?.stock ?? 0;
    const clamped = Math.min(qty, stock, 99);
    if (clamped <= 0) next.delete(id); else next.set(id, clamped);
    return next;
  });

  const sell = async () => {
    if (!lines.length) return;
    setSelling(true);
    const res = await api()?.counterSale?.(lines.map(l => ({ productId: l.product.id, quantity: l.qty })));
    setSelling(false);
    if (!res?.success) {
      onError(res?.message || 'Penjualan gagal disimpan.');
      load(); // stock or prices may have changed; show the server's catalog again
      return;
    }
    setCart(new Map());
    onSold(res);
    load();
  };

  const modeSwitch = (
    <div role="group" aria-label="Mode kasir F&B" className="inline-flex p-0.5 rounded-sm bg-surface-2 border border-hairline">
      {([['jual', 'Jual'], ['produk', 'Produk dan stok']] as const).map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={mode === id}
          onClick={() => setMode(id)}
          className={`h-8 px-3 rounded-xs text-[13px] font-medium transition-colors duration-150 ${FOCUS} ${mode === id ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (mode === 'produk') {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-surface-1">
        <div className="flex-none flex items-center gap-4 px-6 pt-5 pb-4">
          <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-text-primary">Kasir F&amp;B</h1>
          {modeSwitch}
        </div>
        <ProductManager isAdmin={isAdmin} onToast={onToast} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-surface-1">
      <section aria-label="Katalog produk" className="flex flex-col flex-1 min-w-0 border-r border-hairline">
        <div className="flex-none px-6 pt-5 pb-3">
          <div className="flex items-center gap-4">
            <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-text-primary">Kasir F&amp;B</h1>
            {modeSwitch}
            <div className="flex-1" />
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
              <label htmlFor="pos-search" className="sr-only">Cari produk</label>
              <input id="pos-search" className={cn(INPUT, 'h-8 pl-8')} value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari produk" />
            </div>
          </div>
          {products && products.length > 0 && (
            <div role="group" aria-label="Saring kategori" className="flex flex-wrap gap-1 mt-3">
              {categories.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className={`h-7 px-2.5 rounded-sm text-[12px] transition-colors duration-150 ${FOCUS} ${category === c ? 'bg-surface-3 text-text-primary shadow-[inset_0_0_0_1px_rgb(var(--gc-hairline-strong))]' : 'text-text-muted hover:text-text-primary'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 pb-6">
          {loadError ? (
            <ErrorLine message={loadError} onRetry={load} />
          ) : products === null ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2" aria-busy aria-label="Memuat katalog">
              {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[72px] rounded-md bg-surface-3 animate-pulse" />)}
            </div>
          ) : products.length === 0 ? (
            <p className="text-[13px] text-text-muted">Belum ada produk yang dijual. Tambah produk di mode Produk dan stok.</p>
          ) : visible.length === 0 ? (
            <p className="text-[13px] text-text-muted">Tidak ada produk yang cocok.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
              {visible.map(p => {
                const inCart = cart.get(p.id) || 0;
                const soldOut = p.stock <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={soldOut || inCart >= p.stock}
                    onClick={() => setQty(p.id, inCart + 1)}
                    aria-label={`${p.name}, ${rupiah(p.unitPrice)}, stok ${p.stock}${inCart ? `, ${inCart} di keranjang` : ''}`}
                    className={`relative h-[72px] flex flex-col justify-between p-3 rounded-md border text-left transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS} ${inCart ? 'border-primary/60 bg-primary/10' : 'border-hairline bg-surface-2 hover:border-hairline-strong hover:bg-surface-3'}`}
                  >
                    <span className="text-[13px] font-medium text-text-primary truncate pr-6">{p.name}</span>
                    <span className="flex items-baseline justify-between">
                      <span className="font-mono tabular text-[13px] font-semibold text-text-primary">{rupiah(p.unitPrice)}</span>
                      <span className={`text-[11px] ${soldOut ? 'text-error' : p.stock <= 5 ? 'text-warning' : 'text-text-muted'}`}>
                        {soldOut ? 'Habis' : `Stok ${p.stock}`}
                      </span>
                    </span>
                    {inCart > 0 && (
                      <span className="absolute top-2 right-2 min-w-5 h-5 px-1 rounded-xs bg-primary text-on-primary font-mono text-[11px] font-semibold flex items-center justify-center">{inCart}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside aria-label="Keranjang" className="flex flex-col w-[320px] flex-none bg-surface-1">
        <header className="flex-none flex items-center justify-between px-4 h-12 border-b border-hairline">
          <h2 className="text-[15px] font-semibold text-text-primary">Keranjang</h2>
          {lines.length > 0 && (
            <button type="button" onClick={() => setCart(new Map())} className={`h-8 px-2 rounded-sm text-[12px] text-text-muted hover:text-error hover:bg-error/10 ${FOCUS}`}>
              Kosongkan
            </button>
          )}
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {lines.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-text-muted">Keranjang kosong. Klik produk di kiri untuk menambah.</p>
          ) : (
            <ul>
              {lines.map(({ product, qty }) => (
                <li key={product.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-hairline">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-text-primary truncate">{product.name}</div>
                    <div className="text-[12px] text-text-muted font-mono tabular">{rupiah(product.unitPrice)} × {qty}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label={`Kurangi ${product.name}`} onClick={() => setQty(product.id, qty - 1)} className={`w-7 h-7 rounded-sm flex items-center justify-center text-text-secondary hover:bg-surface-3 ${FOCUS}`}>
                      <Minus className="w-3.5 h-3.5" aria-hidden />
                    </button>
                    <span className="w-6 text-center font-mono tabular text-[13px] text-text-primary" aria-label={`${qty} ${product.unitName}`}>{qty}</span>
                    <button type="button" aria-label={`Tambah ${product.name}`} disabled={qty >= product.stock} onClick={() => setQty(product.id, qty + 1)} className={`w-7 h-7 rounded-sm flex items-center justify-center text-text-secondary hover:bg-surface-3 disabled:opacity-40 ${FOCUS}`}>
                      <Plus className="w-3.5 h-3.5" aria-hidden />
                    </button>
                    <button type="button" aria-label={`Hapus ${product.name}`} onClick={() => setQty(product.id, 0)} className={`w-7 h-7 rounded-sm flex items-center justify-center text-text-muted hover:text-error hover:bg-error/10 ${FOCUS}`}>
                      <X className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </div>
                  <span className="w-20 text-right font-mono tabular text-[13px] text-text-primary">{rupiah(product.unitPrice * qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex-none p-4 border-t border-hairline space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-text-secondary">Total</span>
            <span className="font-mono tabular text-[22px] font-semibold text-text-primary">{rupiah(total)}</span>
          </div>
          <button type="button" onClick={sell} disabled={!lines.length || selling} className={cn(BTN_PRIMARY, 'w-full h-11')}>
            {selling ? 'Menyimpan...' : `Terima Tunai ${rupiah(total)}`}
          </button>
        </footer>
      </aside>
    </div>
  );
};
