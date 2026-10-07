import React, { useState, useEffect } from 'react';
import { MemberAccount, CouponAccount } from '../../shared/types';
import {
  Plus, Pencil, Trash2, RotateCw, Search,
  ChevronLeft, ChevronRight, User, Ticket, History, CreditCard, Sparkles, Check
} from 'lucide-react';
import { ConfirmModal } from '../../shared/ui/ConfirmModal';
import { INPUT, BTN_PRIMARY, BTN_SECONDARY, BTN_GHOST, TH, TD } from '../../shared/ui/primitives';
import { cn } from '../../shared/ui/utils';

interface AccountViewProps {
  members: MemberAccount[];
  coupons: CouponAccount[];
  onOpenAddMember: () => void;
  onOpenEditMember: (member: MemberAccount) => void;
  onDeleteMember: (id: number) => void;
  onOpenBuyPackage: (member: MemberAccount) => void;
  onOpenUserPcHistory: (member: MemberAccount) => void;
  onOpenUserPaymentHistory: (member: MemberAccount) => void;
  onOpenCouponBatch?: () => void;
  onDeleteCoupon?: (id: number) => void;
}

export const AccountView: React.FC<AccountViewProps> = ({
  members,
  coupons,
  onOpenAddMember,
  onOpenEditMember,
  onDeleteMember,
  onOpenBuyPackage,
  onOpenUserPcHistory,
  onOpenUserPaymentHistory,
  onOpenCouponBatch,
  onDeleteCoupon,
}) => {
  const [subTab, setSubTab] = useState<'member' | 'kupon'>('member');
  const [searchField, setSearchField] = useState('username');
  const [searchQuery, setSearchQuery] = useState('');
  const [couponStatusFilter, setCouponStatusFilter] = useState<'Semua' | 'Tersedia' | 'Terpakai' | 'Expired'>('Semua');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(members[0]?.id || null);
  const [selectedCouponId, setSelectedCouponId] = useState<number | null>(coupons[0]?.id || null);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [couponToDelete, setCouponToDelete] = useState<CouponAccount | null>(null);
  const PAGE_SIZE = 50;

  const selectedMember = selectedMemberId !== null ? (members.find(m => m.id === selectedMemberId) || null) : null;
  const selectedCoupon = selectedCouponId !== null ? (coupons.find(c => c.id === selectedCouponId) || null) : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedMemberId(null);
        setSelectedCouponId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredMembers = members.filter(m => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (searchField === 'username') return m.username.toLowerCase().includes(q);
    if (searchField === 'firstName') return m.firstName.toLowerCase().includes(q);
    if (searchField === 'groupName') return m.groupName.toLowerCase().includes(q);
    return true;
  });

  const filteredCoupons = coupons.filter(c => {
    if (couponStatusFilter !== 'Semua' && c.status !== couponStatusFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.code.toLowerCase().includes(q) ||
      (c.usedBy && c.usedBy.toLowerCase().includes(q)) ||
      (c.name && c.name.toLowerCase().includes(q))
    );
  });

  const totalPages = subTab === 'member'
    ? Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE))
    : Math.max(1, Math.ceil(filteredCoupons.length / PAGE_SIZE));

  const pagedMembers = filteredMembers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pagedCoupons = filteredCoupons.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex-1 flex overflow-hidden select-none bg-canvas text-text-primary text-[13px]">

      {/* ── Left Inspector Panel ─────────────────────────── */}
      <aside className="w-64 flex-none flex flex-col bg-surface-1 border-r border-hairline">
        {/* Search & Filter */}
        <div className="p-3.5 space-y-2.5 border-b border-hairline">
          {subTab === 'member' ? (
            <div>
              <label htmlFor="member-filter-field" className="block text-[11px] font-medium text-text-muted mb-1">
                Cari Berdasarkan
              </label>
              <select
                id="member-filter-field"
                value={searchField}
                onChange={e => setSearchField(e.target.value)}
                className={cn(INPUT, 'h-8 text-[12px]')}
              >
                <option value="username">Username</option>
                <option value="firstName">Nama Depan</option>
                <option value="groupName">Grup User</option>
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="coupon-status-filter" className="block text-[11px] font-medium text-text-muted mb-1">
                Filter Status
              </label>
              <select
                id="coupon-status-filter"
                value={couponStatusFilter}
                onChange={e => setCouponStatusFilter(e.target.value as any)}
                className={cn(INPUT, 'h-8 text-[12px]')}
              >
                <option value="Semua">Semua Status</option>
                <option value="Tersedia">Tersedia (Aktif)</option>
                <option value="Terpakai">Terpakai (Used)</option>
                <option value="Expired">Kedaluwarsa (Expired)</option>
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder={subTab === 'member' ? 'Cari nama member...' : 'Cari kode voucher...'}
              className={cn(INPUT, 'h-8 pl-8 text-[12px]')}
            />
          </div>
        </div>

        {/* Selected Member Quick Info */}
        {subTab === 'member' && selectedMember && (
          <div className="p-3.5 space-y-3 border-b border-hairline bg-surface-2/40">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              Member Terpilih
            </div>
            <div>
              <div className="text-[15px] font-semibold text-text-primary leading-tight">{selectedMember.username}</div>
              <div className="text-[12px] text-text-muted mt-0.5">{selectedMember.groupName}</div>
            </div>
            <div className="flex items-baseline justify-between pt-1 border-t border-hairline">
              <span className="text-[12px] text-text-muted">Saldo</span>
              <span className="text-[15px] font-semibold font-mono tabular text-warning">
                Rp {selectedMember.money.toLocaleString('id-ID')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenBuyPackage(selectedMember)}
              className={cn(BTN_PRIMARY, 'w-full h-8 text-[12px]')}
            >
              Beli Paket / Topup
            </button>
          </div>
        )}

        {/* Selected Coupon Quick Info */}
        {subTab === 'kupon' && selectedCoupon && (
          <div className="p-3.5 space-y-3 border-b border-hairline bg-surface-2/40">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              Voucher Terpilih
            </div>
            <div className="p-2.5 rounded-sm bg-surface-2 border border-hairline text-center">
              <div className="font-mono font-bold text-[14px] text-text-primary tracking-wider">
                {selectedCoupon.code}
              </div>
              <div className="text-[11px] font-medium text-primary mt-0.5">
                {selectedCoupon.type === 'time'
                  ? `${selectedCoupon.durationMinutes} Menit Sewa`
                  : `Saldo Rp ${(selectedCoupon.value || selectedCoupon.money || 0).toLocaleString('id-ID')}`}
              </div>
            </div>

            <div className="space-y-1.5 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Status</span>
                <span className={`px-1.5 py-0.5 rounded-xs text-[11px] font-semibold uppercase tracking-wider ${
                  selectedCoupon.status === 'Tersedia'
                    ? 'bg-primary/15 text-primary'
                    : selectedCoupon.status === 'Terpakai'
                    ? 'bg-info/15 text-info'
                    : 'bg-error/15 text-error'
                }`}>
                  {selectedCoupon.status}
                </span>
              </div>
              {selectedCoupon.usedBy && (
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">User</span>
                  <span className="text-text-primary font-medium">{selectedCoupon.usedBy}</span>
                </div>
              )}
              {selectedCoupon.expiredAt && (
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Kedaluwarsa</span>
                  <span className="text-text-secondary font-mono tabular">{selectedCoupon.expiredAt}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleCopyCode(selectedCoupon.code)}
                className={cn(BTN_SECONDARY, 'w-full h-8 text-[12px]')}
              >
                {copiedCode === selectedCoupon.code ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-primary" aria-hidden />
                    <span className="text-primary font-semibold">Tersalin ke Clipboard</span>
                  </>
                ) : (
                  <span>Salin Kode Voucher</span>
                )}
              </button>
              {onDeleteCoupon && (
                <button
                  type="button"
                  onClick={() => setCouponToDelete(selectedCoupon)}
                  className="w-full h-8 inline-flex items-center justify-center rounded-sm bg-error/10 border border-error/30 text-error hover:bg-error/20 text-[12px] font-medium transition-colors"
                >
                  Hapus Voucher
                </button>
              )}
            </div>
          </div>
        )}

        {/* History Actions for Member */}
        {subTab === 'member' && selectedMember && (
          <div className="p-3.5 space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-2">
              Aksi Riwayat
            </div>
            <button
              type="button"
              onClick={() => onOpenUserPcHistory(selectedMember)}
              className={cn(BTN_GHOST, 'w-full justify-start text-text-secondary hover:text-text-primary hover:bg-surface-2')}
            >
              <History className="w-3.5 h-3.5 flex-none text-text-muted" aria-hidden />
              <span>Sejarah Bilik PC</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenUserPaymentHistory(selectedMember)}
              className={cn(BTN_GHOST, 'w-full justify-start text-text-secondary hover:text-text-primary hover:bg-surface-2')}
            >
              <CreditCard className="w-3.5 h-3.5 flex-none text-text-muted" aria-hidden />
              <span>Sejarah Pembayaran</span>
            </button>
          </div>
        )}
      </aside>

      {/* ── Main Content Area ────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-canvas">

        {/* Toolbar Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-surface-1 border-b border-hairline">
          {/* Sub-tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setSubTab('member'); setCurrentPage(1); }}
              className={`flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] border-b-2 transition-colors ${
                subTab === 'member'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              <User className="w-3.5 h-3.5" aria-hidden />
              <span>Member ({members.length})</span>
            </button>

            <button
              type="button"
              onClick={() => { setSubTab('kupon'); setCurrentPage(1); }}
              className={`flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] border-b-2 transition-colors ${
                subTab === 'kupon'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" aria-hidden />
              <span>Voucher ({coupons.length})</span>
            </button>
          </div>

          {/* Action Bar & Pagination */}
          <div className="flex items-center gap-3">
            {subTab === 'kupon' && onOpenCouponBatch && (
              <button
                type="button"
                onClick={onOpenCouponBatch}
                className={cn(BTN_PRIMARY, 'h-8 text-[12px]')}
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden />
                <span>Cetak Batch Voucher</span>
              </button>
            )}

            {subTab === 'member' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenAddMember}
                  className={cn(BTN_PRIMARY, 'h-8 text-[12px]')}
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden />
                  <span>Tambah Member</span>
                </button>

                {selectedMember && (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpenEditMember(selectedMember)}
                      className={cn(BTN_SECONDARY, 'h-8 text-[12px]')}
                      title="Edit Data Member"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMember(selectedMember.id)}
                      className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-sm bg-error/10 border border-error/30 text-error hover:bg-error/20 text-[12px] font-medium transition-colors"
                      title="Hapus Akun Member"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      <span>Hapus</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => { setCurrentPage(1); setSearchQuery(''); }}
                  className={cn(BTN_GHOST, 'text-text-muted hover:text-text-primary')}
                  title="Reset Filter"
                >
                  <RotateCw className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            )}

            {/* Pagination */}
            <div className="flex items-center gap-1 text-[12px] text-text-muted border-l border-hairline pl-3">
              <span>Hal:</span>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="w-7 h-7 flex items-center justify-center rounded-sm bg-surface-2 border border-hairline text-text-secondary hover:border-hairline-strong disabled:opacity-30 disabled:pointer-events-none transition-colors"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 py-0.5 rounded-sm bg-surface-2 border border-hairline text-text-primary font-mono tabular min-w-[28px] text-center">
                {currentPage}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="w-7 h-7 flex items-center justify-center rounded-sm bg-surface-2 border border-hairline text-text-secondary hover:border-hairline-strong disabled:opacity-30 disabled:pointer-events-none transition-colors"
                aria-label="Halaman berikutnya"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span>/ {totalPages}</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div
          className="flex-1 overflow-auto"
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName === 'DIV' || (e.target as HTMLElement).tagName === 'TABLE' || (e.target as HTMLElement).tagName === 'TBODY') {
              setSelectedMemberId(null);
              setSelectedCouponId(null);
            }
          }}
        >
          {subTab === 'member' ? (
            <table className="w-full text-left border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface-2 border-b border-hairline">
                <tr>
                  <th className={TH}>Username</th>
                  <th className={TH}>Nama Lengkap</th>
                  <th className={`${TH} text-right`}>Saldo</th>
                  <th className={TH}>Grup</th>
                  <th className={TH}>No. Telepon</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedMembers.map((m) => {
                  const sel = m.id === selectedMemberId;
                  const fullName = [m.firstName, m.lastName].filter(Boolean).join(' ') || '—';
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMemberId(prev => prev === m.id ? null : m.id)}
                      onDoubleClick={() => onOpenEditMember(m)}
                      className={`cursor-pointer transition-colors border-b border-hairline ${
                        sel ? 'bg-surface-3' : 'hover:bg-surface-2/60'
                      }`}
                    >
                      <td className={`${TD} font-semibold ${sel ? 'text-primary' : 'text-text-primary'}`}>
                        {m.username}
                      </td>
                      <td className={`${TD} text-text-secondary`}>{fullName}</td>
                      <td className={`${TD} text-right font-mono tabular font-semibold text-warning`}>
                        Rp {m.money.toLocaleString('id-ID')}
                      </td>
                      <td className={`${TD} text-text-muted`}>{m.groupName}</td>
                      <td className={`${TD} text-text-muted font-mono tabular`}>{m.phone || '—'}</td>
                      <td className={TD}>
                        <span className={`px-1.5 py-0.5 rounded-xs text-[11px] font-semibold uppercase tracking-wider ${
                          m.status === 'Normal' ? 'bg-primary/15 text-primary' : 'bg-error/15 text-error'
                        }`}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {pagedMembers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-text-disabled">
                      Belum ada data member. Tambahkan akun baru dengan tombol Tambah Member di atas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface-2 border-b border-hairline">
                <tr>
                  <th className={TH}>Kode Voucher</th>
                  <th className={TH}>Paket / Nominal</th>
                  <th className={`${TH} text-right`}>Durasi / Saldo</th>
                  <th className={TH}>Tier Hak Akses</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Digunakan Oleh</th>
                  <th className={TH}>Kedaluwarsa</th>
                </tr>
              </thead>
              <tbody>
                {pagedCoupons.map((c) => {
                  const sel = c.id === selectedCouponId;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCouponId(prev => prev === c.id ? null : c.id)}
                      className={`cursor-pointer transition-colors border-b border-hairline ${
                        sel ? 'bg-surface-3' : 'hover:bg-surface-2/60'
                      }`}
                    >
                      <td className={`${TD} font-mono font-bold ${sel ? 'text-primary' : 'text-text-primary'}`}>
                        <div className="flex items-center gap-2">
                          <span>{c.code}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyCode(c.code);
                            }}
                            className="text-[11px] px-1.5 py-0.5 rounded-xs bg-surface-3 hover:bg-hairline text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
                          >
                            {copiedCode === c.code ? (
                              <Check className="w-3 h-3 text-primary" />
                            ) : (
                              <span>Salin</span>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className={`${TD} text-text-secondary`}>
                        {c.name || (c.type === 'time' ? `${c.durationMinutes} Menit` : `Saldo Rp ${(c.value || c.money || 0).toLocaleString('id-ID')}`)}
                      </td>
                      <td className={`${TD} text-right font-mono tabular font-semibold text-warning`}>
                        {c.type === 'time' ? `${c.durationMinutes}m` : `Rp ${(c.value || c.money || 0).toLocaleString('id-ID')}`}
                      </td>
                      <td className={`${TD} text-text-muted`}>{c.groupName}</td>
                      <td className={TD}>
                        <span className={`px-1.5 py-0.5 rounded-xs text-[11px] font-semibold uppercase tracking-wider ${
                          c.status === 'Tersedia'
                            ? 'bg-primary/15 text-primary'
                            : c.status === 'Terpakai'
                            ? 'bg-info/15 text-info'
                            : 'bg-error/15 text-error'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className={`${TD} text-text-muted`}>
                        {c.usedBy ? <span className="text-text-primary font-medium">{c.usedBy}</span> : '—'}
                      </td>
                      <td className={`${TD} text-text-muted font-mono tabular text-[12px]`}>
                        {c.expiredAt || '30 Hari'}
                      </td>
                    </tr>
                  );
                })}
                {pagedCoupons.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-text-disabled">
                      Tidak ada voucher yang cocok dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {couponToDelete && (
        <ConfirmModal
          isOpen={true}
          title="Hapus Voucher Prabayar"
          description={`Apakah Anda yakin ingin menghapus voucher [${couponToDelete.code}]?`}
          detail={`Voucher ${couponToDelete.durationMinutes ? `${couponToDelete.durationMinutes} menit ` : ''}ini akan dihapus permanen dari sistem.`}
          iconType="danger"
          confirmText="Hapus Voucher"
          confirmVariant="danger"
          onConfirm={() => {
            if (onDeleteCoupon) onDeleteCoupon(couponToDelete.id);
            setSelectedCouponId(null);
            setCouponToDelete(null);
          }}
          onClose={() => setCouponToDelete(null)}
        />
      )}
    </div>
  );
};
