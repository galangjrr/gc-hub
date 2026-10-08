import React, { useState, useEffect, useRef } from 'react';
import { BillingPackage, Workstation } from '../../shared/types';
import { PcCard, cardStatus, CardStatus } from './PcCard';
import { 
  ChevronRight, 
  Volume2, 
  Camera, 
  Monitor, 
  MessageSquare, 
  Power, 
  RotateCcw, 
  DollarSign, 
  Clock, 
  LogOut, 
  Layers,
  X,
  Zap,
  UserCheck,
  Cpu,
  Trash2,
  Banknote,
  UtensilsCrossed,
  Package,
  Plus,
  ArrowRightLeft,
  Lock,
  Unlock
} from 'lucide-react';
import { ConfirmModal } from '../../shared/ui/ConfirmModal';
import { isPackageOnSale } from '../../shared/packageRules';
import { ErrorLine } from '../../shared/ui/primitives';

const STATUS_FILTERS: Array<{ id: 'all' | 'main' | 'unpaid' | 'locked' | 'idle' | 'off'; label: string; swatch: string; match: (s: CardStatus) => boolean }> = [
  { id: 'all', label: 'Semua', swatch: 'rgb(var(--gc-text-muted))', match: () => true },
  { id: 'main', label: 'Main', swatch: 'rgb(var(--gc-primary))', match: s => s === 'main' || s === 'low' },
  { id: 'unpaid', label: 'Belum bayar', swatch: 'rgb(var(--gc-warning))', match: s => s === 'unpaid' },
  { id: 'locked', label: 'Terkunci', swatch: 'rgb(var(--gc-error))', match: s => s === 'locked' },
  { id: 'idle', label: 'Tersedia', swatch: 'rgb(var(--gc-hairline-strong))', match: s => s === 'idle' },
  { id: 'off', label: 'Mati', swatch: 'rgb(var(--gc-text-disabled))', match: s => s === 'off' },
];

interface PCGridProps {
  workstations: Workstation[];
  dataStatus?: 'loading' | 'error' | 'ready';
  onRetryLoad?: () => void;
  packages: BillingPackage[]; // admin-configured catalog (Pengaturan > Tarif & Paket)
  selectedPc: Workstation | null;
  unreadChatMap?: Record<string, number>;
  onSelectPc: (pc: Workstation | null) => void;
  onOpenVolumeModal: (pc: Workstation) => void;
  onOpenScreenshotModal: (pc: Workstation) => void;
  onOpenVncModal: (pc: Workstation) => void;
  onOpenChatModal: (pc: Workstation) => void;
  onOpenBuyPackageModal: (pc: Workstation) => void;
  onOpenOrderModal: (pc: Workstation) => void;
  onOpenTaskManagerModal?: (pc: Workstation) => void;
  onOpenAddWorkstation?: () => void;
  onActionPc: (action: string, pc: Workstation, payload?: any) => void;
  onReorderWorkstations?: (newOrder: Workstation[]) => void;
}

export const PCGrid: React.FC<PCGridProps> = ({
  workstations,
  dataStatus = 'ready',
  onRetryLoad,
  packages,
  selectedPc,
  unreadChatMap = {},
  onSelectPc,
  onOpenVolumeModal,
  onOpenScreenshotModal,
  onOpenVncModal,
  onOpenChatModal,
  onOpenBuyPackageModal,
  onOpenOrderModal,
  onOpenTaskManagerModal,
  onOpenAddWorkstation,
  onActionPc,
  onReorderWorkstations
}) => {
  // Multi-selection state
  const [selectedPcIds, setSelectedPcIds] = useState<number[]>(selectedPc ? [selectedPc.id] : []);
  const [draggedPcId, setDraggedPcId] = useState<number | null>(null);
  const [dragOverPcId, setDragOverPcId] = useState<number | null>(null);

  // Marquee selection state
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const [isMarqueeActive, setIsMarqueeActive] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    pc: Workstation | null;
    activeSubmenu: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    pc: null,
    activeSubmenu: null
  });

  const [isBatchPackageDropdownOpen, setIsBatchPackageDropdownOpen] = useState(false);
  const [billingPcId, setBillingPcId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'main' | 'unpaid' | 'locked' | 'idle' | 'off'>('all');

  // Custom Dark Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    detail?: string;
    iconType?: 'danger' | 'warning' | 'refund' | 'logout' | 'info';
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    if (selectedPc) {
      if (!selectedPcIds.includes(selectedPc.id)) {
        setSelectedPcIds([selectedPc.id]);
      }
    } else {
      setSelectedPcIds([]);
    }
  }, [selectedPc]);

  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible) {
        setContextMenu(prev => ({ ...prev, visible: false, activeSubmenu: null }));
      }
      setIsBatchPackageDropdownOpen(false);
      setBillingPcId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [contextMenu.visible]);

  // Global Escape key listener to clear selections / context menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (billingPcId !== null) {
          setBillingPcId(null);
        } else if (isBatchPackageDropdownOpen) {
          setIsBatchPackageDropdownOpen(false);
        } else if (contextMenu.visible) {
          setContextMenu(prev => ({ ...prev, visible: false, activeSubmenu: null }));
        } else if (selectedPcIds.length > 0 || selectedPc) {
          setSelectedPcIds([]);
          onSelectPc(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu.visible, selectedPcIds, selectedPc, isBatchPackageDropdownOpen, onSelectPc, billingPcId]);

  // Click Handler with Toggle / Ctrl / Shift multi-select & unselect support
  const handleCardClick = (e: React.MouseEvent, pc: Workstation) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      // Toggle selection in multi-select
      setSelectedPcIds(prev => {
        const next = prev.includes(pc.id) ? prev.filter(id => id !== pc.id) : [...prev, pc.id];
        if (next.length === 0) {
          onSelectPc(null);
        } else {
          const lastId = next[next.length - 1];
          const lastPc = workstations.find(w => w.id === lastId);
          onSelectPc(lastPc || null);
        }
        return next;
      });
    } else if (e.shiftKey && selectedPcIds.length > 0) {
      // Range select
      const lastSelectedId = selectedPcIds[selectedPcIds.length - 1];
      const lastIndex = workstations.findIndex(w => w.id === lastSelectedId);
      const currentIndex = workstations.findIndex(w => w.id === pc.id);
      const start = Math.min(lastIndex, currentIndex);
      const end = Math.max(lastIndex, currentIndex);
      const rangeIds = workstations.slice(start, end + 1).map(w => w.id);
      setSelectedPcIds(Array.from(new Set([...selectedPcIds, ...rangeIds])));
      onSelectPc(pc);
    } else {
      // Single select: Toggle off if clicking the already selected single PC
      if (selectedPcIds.length === 1 && selectedPcIds[0] === pc.id) {
        setSelectedPcIds([]);
        onSelectPc(null);
      } else {
        setSelectedPcIds([pc.id]);
        onSelectPc(pc);
      }
    }
  };

  // Right-Click Context Menu Handler
  const handleContextMenu = (e: React.MouseEvent, pc: Workstation) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedPcIds.includes(pc.id)) {
      setSelectedPcIds([pc.id]);
    }
    onSelectPc(pc);

    const menuWidth = 230;
    const menuHeight = 340;
    let posX = e.clientX;
    let posY = e.clientY;

    if (posX + menuWidth > window.innerWidth) {
      posX = window.innerWidth - menuWidth - 10;
    }
    if (posY + menuHeight > window.innerHeight) {
      posY = window.innerHeight - menuHeight - 10;
    }

    setContextMenu({
      visible: true,
      x: posX,
      y: posY,
      pc,
      activeSubmenu: null
    });
  };

  // Drag and drop handlers for floor plan re-ordering
  const handleDragStart = (e: React.DragEvent, pc: Workstation) => {
    setDraggedPcId(pc.id);
    e.dataTransfer.setData('text/plain', pc.id.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, pc: Workstation) => {
    e.preventDefault();
    if (draggedPcId && draggedPcId !== pc.id) {
      setDragOverPcId(pc.id);
    }
  };

  const handleDragLeave = () => {
    setDragOverPcId(null);
  };

  const handleDrop = (e: React.DragEvent, targetPc: Workstation) => {
    e.preventDefault();
    setDragOverPcId(null);
    if (!draggedPcId || draggedPcId === targetPc.id) return;

    const sourceIndex = workstations.findIndex(w => w.id === draggedPcId);
    const targetIndex = workstations.findIndex(w => w.id === targetPc.id);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const newWorkstations = [...workstations];
    const [moved] = newWorkstations.splice(sourceIndex, 1);
    newWorkstations.splice(targetIndex, 0, moved);

    if (onReorderWorkstations) {
      onReorderWorkstations(newWorkstations);
    }
    setDraggedPcId(null);
  };

  // Marquee mouse events on background / container
  const handleMouseDownOnGrid = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-pc-card="true"]') || target.closest('button') || target.closest('[role="menu"]')) {
      return;
    }
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    setIsMarqueeActive(true);
    setMarqueeBox({
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY
    });
  };

  const handleMouseMoveOnGrid = (e: React.MouseEvent) => {
    if (!isMarqueeActive || !marqueeBox) return;
    setMarqueeBox(prev => prev ? ({ ...prev, currentX: e.clientX, currentY: e.clientY }) : null);
  };

  const handleMouseUpOnGrid = (e: React.MouseEvent) => {
    if (isMarqueeActive && dragStartPos.current) {
      const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
      if (dist < 6) {
        // Direct click on empty background / gaps -> Unselect all
        setSelectedPcIds([]);
        onSelectPc(null);
      } else if (marqueeBox && gridContainerRef.current) {
        // Calculate intersected cards
        const boxLeft = Math.min(marqueeBox.startX, marqueeBox.currentX);
        const boxRight = Math.max(marqueeBox.startX, marqueeBox.currentX);
        const boxTop = Math.min(marqueeBox.startY, marqueeBox.currentY);
        const boxBottom = Math.max(marqueeBox.startY, marqueeBox.currentY);

        const cardElements = gridContainerRef.current.querySelectorAll<HTMLElement>('[data-pc-card="true"]');
        const intersectedIds: number[] = [];

        cardElements.forEach(card => {
          const rect = card.getBoundingClientRect();
          const isIntersecting =
            rect.left < boxRight &&
            rect.right > boxLeft &&
            rect.top < boxBottom &&
            rect.bottom > boxTop;

          if (isIntersecting) {
            const pcId = Number(card.getAttribute('data-pc-id'));
            if (pcId) intersectedIds.push(pcId);
          }
        });

        if (intersectedIds.length > 0) {
          setSelectedPcIds(intersectedIds);
          const firstSelected = workstations.find(w => w.id === intersectedIds[0]);
          onSelectPc(firstSelected || null);
        } else {
          setSelectedPcIds([]);
          onSelectPc(null);
        }
      }
    }
    setIsMarqueeActive(false);
    setMarqueeBox(null);
    dragStartPos.current = null;
  };

  // Starting a session never uses extension-only packages; the engine refuses them too.
  const packageList = packages.filter(p => !p.isExtensionOnly && isPackageOnSale(p));
  const extendList = packages;

  // Batch actions for multi-selection
  const selectedWorkstations = workstations.filter(w => selectedPcIds.includes(w.id));
  const isMultiSelected = selectedPcIds.length > 1;

  const handleBatchAction = (action: string) => {
    selectedWorkstations.forEach(pc => {
      onActionPc(action, pc);
    });
  };

  return (
    <div 
      ref={gridContainerRef}
      onMouseDown={handleMouseDownOnGrid}
      onMouseMove={handleMouseMoveOnGrid}
      onMouseUp={handleMouseUpOnGrid}
      className="flex-1 p-4 overflow-y-auto relative select-none"
      style={{ background: 'rgb(var(--gc-canvas))' }}
    >
      {/* Visual Marquee Drag Box */}
      {isMarqueeActive && marqueeBox && (
        <div
          className="fixed pointer-events-none z-40"
          style={{
            border: '1px solid rgb(var(--gc-primary))',
            background: 'rgb(var(--gc-primary) / 0.06)',
            borderRadius: '2px',
            left: Math.min(marqueeBox.startX, marqueeBox.currentX),
            top: Math.min(marqueeBox.startY, marqueeBox.currentY),
            width: Math.abs(marqueeBox.currentX - marqueeBox.startX),
            height: Math.abs(marqueeBox.currentY - marqueeBox.startY)
          }}
        />
      )}

      {/* Floating Batch Actions Bar (When Multi-Selected) */}
      {isMultiSelected && (
        <div
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2 px-4 py-2 text-xs animate-in fade-in slide-in-from-bottom-3 duration-200"
          style={{ background: 'rgb(var(--gc-surface-2))', border: '1px solid rgb(var(--gc-hairline-strong))', borderRadius: '9999px', boxShadow: '0 12px 32px rgb(var(--gc-shadow) / 0.35)', color: 'rgb(var(--gc-text-primary))' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center space-x-1.5 pr-3" style={{ borderRight: '1px solid rgb(var(--gc-hairline-strong))', color: 'rgb(var(--gc-primary))' }}>
            <Layers className="w-4 h-4" />
            <span className="font-semibold">{selectedPcIds.length} PC Dipilih</span>
          </div>

          {/* 1. Login Sesi Personal Masal */}
          <button
            onClick={() => {
              selectedWorkstations.forEach(pc => onActionPc('login_guest_open', pc));
            }}
            title="Buka sesi personal (argo waktu maju) untuk semua PC yang dipilih"
            className="flex items-center space-x-1 px-2.5 py-1 transition font-medium text-primary hover:bg-surface-3"
            style={{ borderRadius: '4px' }}
          >
            <UserCheck className="w-3.5 h-3.5 text-primary" />
            <span>Login Sesi</span>
          </button>

          {/* 2. Login Paket / Tambah Paket Masal Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsBatchPackageDropdownOpen(prev => !prev)}
              title="Terapkan paket: Buka sesi jika PC kosong, atau Tambah waktu jika PC sedang aktif"
              className="flex items-center space-x-1 px-2.5 py-1 transition font-medium"
              style={{ borderRadius: '4px', color: 'rgb(var(--gc-info))', background: isBatchPackageDropdownOpen ? 'rgb(var(--gc-surface-3))' : 'transparent' }}
            >
              <Clock className="w-3.5 h-3.5 text-info" />
              <span>
                {selectedWorkstations.filter(w => w.state === 'active_member' || w.state === 'active_guest' || w.state === 'unpaid').length === 0
                  ? 'Login Paket'
                  : (selectedWorkstations.filter(w => w.state === 'idle' || w.state === 'offline').length === 0
                    ? '+ Tambah Paket'
                    : 'Paket Masal')}
              </span>
            </button>

            {isBatchPackageDropdownOpen && (
              <div
                className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-52 bg-surface-2 border border-hairline-strong rounded-lg shadow-2xl p-1.5 z-50 text-xs flex flex-col space-y-1"
                style={{ boxShadow: '0 12px 32px rgb(var(--gc-shadow) / 0.35)' }}
              >
                <div className="px-2 py-1 text-[10px] font-bold text-text-muted uppercase border-b border-surface-carbon flex items-center justify-between">
                  <span>Pilih Paket ({selectedPcIds.length} PC)</span>
                  <button onClick={() => setIsBatchPackageDropdownOpen(false)} className="text-text-muted hover:text-text-primary">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-surface-carbon">
                  {packageList.map(pkg => (
                    <button
                      key={pkg.name}
                      onClick={() => {
                        selectedWorkstations.forEach(pc => {
                          if (pc.state === 'active_member' || pc.state === 'active_guest' || pc.state === 'unpaid') {
                            onActionPc('add_package', pc, pkg);
                          } else {
                            onActionPc('login_package', pc, pkg);
                          }
                        });
                        setIsBatchPackageDropdownOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-surface-3 flex items-center justify-between transition text-[11px] rounded"
                    >
                      <span className="font-semibold text-text-primary">{pkg.name} ({pkg.time})</span>
                      <span className="font-mono text-warning">Rp {(pkg.price ?? 0).toLocaleString('id-ID')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. Logout Sesi Masal */}
          <button
            onClick={() => {
              const activeCount = selectedWorkstations.filter(w => w.state === 'active_member' || w.state === 'active_guest' || w.state === 'unpaid').length;
              if (activeCount === 0) {
                selectedWorkstations.forEach(pc => onActionPc('logout', pc));
                return;
              }
              setConfirmDialog({
                isOpen: true,
                title: 'Logout Sesi Masal',
                description: `Hentikan dan logout sesi untuk ${activeCount} komputer yang sedang aktif?`,
                detail: 'Klien akan otomatis dikunci kembali ke tampilan awal.',
                iconType: 'logout',
                confirmText: 'Logout Sesi',
                confirmVariant: 'danger',
                onConfirm: () => selectedWorkstations.forEach(pc => onActionPc('logout', pc))
              });
            }}
            title="Hentikan & logout sesi komputer yang sedang aktif"
            className="flex items-center space-x-1 px-2.5 py-1 transition font-medium text-error hover:bg-surface-3"
            style={{ borderRadius: '4px' }}
          >
            <LogOut className="w-3.5 h-3.5 text-error" />
            <span>Logout Sesi</span>
          </button>

          <div className="h-4 w-px bg-hairline-strong" />

          {/* Remote PC Controls */}
          {[
            { icon: Zap, label: 'WOL', action: 'wake_on_lan', color: 'rgb(var(--gc-primary))' },
            { icon: RotateCcw, label: 'Restart', action: 'restart', color: 'rgb(var(--gc-warning))' },
            { icon: Power, label: 'Shutdown', action: 'shutdown', color: 'rgb(var(--gc-error))' },
            { icon: MessageSquare, label: 'Broadcast', action: 'broadcast', color: 'rgb(var(--gc-info))' },
          ].map(({ icon: Icon, label, action, color }) => (
            <button
              key={action}
              onClick={() => {
                if (action === 'broadcast') {
                  if (selectedWorkstations.length > 0) {
                    onOpenChatModal(selectedWorkstations[0]);
                  }
                } else {
                  handleBatchAction(action);
                }
              }}
              className="flex items-center space-x-1 px-2.5 py-1 transition font-medium"
              style={{ borderRadius: '4px', color: 'rgb(var(--gc-text-secondary))', background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgb(var(--gc-surface-3))'; e.currentTarget.style.color = color; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgb(var(--gc-text-secondary))'; }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color }} />
              <span>{label}</span>
            </button>
          ))}

          <button
            onClick={() => {
              setSelectedPcIds([]);
              onSelectPc(null);
            }}
            title="Batalkan pilihan (Unselect semua / Esc)"
            className="p-1 ml-1 transition hover:text-text-primary hover:bg-surface-3"
            style={{ borderRadius: '9999px', color: 'rgb(var(--gc-text-muted))' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header: title, status filter, add PC */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3">
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.015em] text-text-primary">Komputer</h1>
        <div role="group" aria-label="Saring status komputer" className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map(f => {
            const count = workstations.filter(w => f.match(cardStatus(w))).length;
            const on = statusFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-sm text-[12px] transition-colors ${on ? 'bg-surface-3 text-text-primary shadow-[inset_0_0_0_1px_rgb(var(--gc-hairline-strong))]' : 'text-text-muted hover:text-text-primary'}`}
              >
                <span className="w-2 h-2 rounded-xs" style={{ background: f.swatch }} aria-hidden />
                <span>{f.label}</span>
                <span className="font-mono text-[11px] opacity-80">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        {onOpenAddWorkstation && (
          <button
            type="button"
            onClick={onOpenAddWorkstation}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-sm bg-surface-2 border border-hairline text-[13px] font-medium text-text-primary hover:bg-surface-3 active:translate-y-px"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden />
            <span>Tambah PC</span>
          </button>
        )}
      </div>

      {dataStatus === 'error' && workstations.length === 0 ? (
        <div className="max-w-xl mx-auto mt-10">
          <ErrorLine message="Daftar PC gagal dimuat dari database." onRetry={() => onRetryLoad?.()} />
        </div>
      ) : dataStatus === 'loading' && workstations.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-2" aria-busy aria-label="Memuat daftar PC">
          {Array.from({ length: 12 }, (_, i) => <div key={i} className="h-[124px] rounded-md bg-surface-3 animate-pulse" />)}
        </div>
      ) : workstations.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[380px] py-12 text-center">
          <Monitor className="w-9 h-9 mb-3 text-text-muted" strokeWidth={1.6} aria-hidden />
          <div className="text-[15px] font-semibold text-text-primary">Belum ada PC terdaftar</div>
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-text-muted">
            Jalankan GC Hub Client di PC bilik supaya muncul otomatis dengan nama komputernya, atau tambah manual.
          </p>
          {onOpenAddWorkstation && (
            <button
              type="button"
              onClick={onOpenAddWorkstation}
              className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-sm bg-primary text-on-primary text-[13px] font-semibold hover:bg-primary-hover active:translate-y-px"
            >
              <Plus className="w-4 h-4" aria-hidden />
              <span>Tambah PC</span>
            </button>
          )}
        </div>
      ) : (() => {
        const active = STATUS_FILTERS.find(f => f.id === statusFilter) || STATUS_FILTERS[0];
        const visible = workstations.filter(w => active.match(cardStatus(w)));
        if (visible.length === 0) {
          return (
            <p className="py-10 text-center text-[13px] text-text-muted">
              Tidak ada PC dengan status {active.label.toLowerCase()}.{' '}
              <button type="button" onClick={() => setStatusFilter('all')} className="underline text-text-primary">Tampilkan semua</button>
            </p>
          );
        }
        const groups: Array<{ name: string; pcs: Workstation[] }> = [];
        visible.forEach(w => {
          const name = w.groupName || 'Tanpa Grup';
          const g = groups.find(x => x.name === name);
          if (g) g.pcs.push(w); else groups.push({ name, pcs: [w] });
        });
        return (
          <div className="flex flex-col gap-4 pb-6">
            {groups.map(group => (
              <section key={group.name} aria-label={group.name} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] uppercase text-text-muted">
                  <span>{group.name}</span>
                  <span className="font-mono font-medium">{group.pcs.length} PC</span>
                  <div className="flex-1 h-px bg-hairline" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-2">
                  {group.pcs.map(pc => (
                    <PcCard
                      key={pc.id}
                      pc={pc}
                      isSelected={selectedPcIds.includes(pc.id)}
                      isDragOver={dragOverPcId === pc.id}
                      unreadChats={unreadChatMap[pc.id] || unreadChatMap[pc.name] || 0}
                      isBillingOpen={billingPcId === pc.id}
                      onSelect={(e) => { setBillingPcId(null); handleCardClick(e, pc); }}
                      onContextMenu={(e) => handleContextMenu(e, pc)}
                      onToggleBilling={() => setBillingPcId(prev => (prev === pc.id ? null : pc.id))}
                      onCloseBilling={() => setBillingPcId(null)}
                      onOpenOrders={() => onOpenOrderModal(pc)}
                      onOpenChat={() => onOpenChatModal(pc)}
                      onAddPackage={() => { setBillingPcId(null); onOpenBuyPackageModal(pc); }}
                      onRefund={() => { setBillingPcId(null); onActionPc('open_refund', pc); }}
                      onFinishPersonal={() => { setBillingPcId(null); onActionPc('logout', pc); }}
                      onSettle={() => { setBillingPcId(null); onActionPc('settle_unpaid', pc); }}
                      dragProps={{
                        draggable: true,
                        onDragStart: (e) => handleDragStart(e, pc),
                        onDragOver: (e) => handleDragOver(e, pc),
                        onDragLeave: handleDragLeave,
                        onDrop: (e) => handleDrop(e, pc),
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        );
      })()}

      {/* Streamlined 1:1 Authentic Right-Click Context Menu */}
      {contextMenu.visible && contextMenu.pc && (() => {
        const availableDestinationPcs = workstations.filter(
          w => (w.state === 'idle' || w.state === 'offline') && w.id !== contextMenu.pc?.id
        );
        const isSelectedActive = isMultiSelected && selectedPcIds.includes(contextMenu.pc.id);
        const isCurrentActive = contextMenu.pc.state === 'active_member' || contextMenu.pc.state === 'active_guest' || contextMenu.pc.state === 'locked' || contextMenu.pc.state === 'unpaid' || contextMenu.pc.isUnpaid;

        return (
          <div
            style={{ 
              top: `${contextMenu.y}px`, 
              left: `${contextMenu.x}px`, 
              background: 'rgb(var(--gc-surface-2))', 
              border: '1px solid rgb(var(--gc-hairline))', 
              borderRadius: '5px', 
              boxShadow: '0 16px 36px rgb(var(--gc-shadow) / 0.35)', 
              color: 'rgb(var(--gc-text-secondary))' 
            }}
            className="fixed z-50 w-56 py-1 text-[12px] font-sans select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Bar */}
            <div className="px-3 py-1.5 flex items-center justify-between bg-surface-3/80 border-b border-hairline mb-1">
              <div className="flex items-center space-x-1.5 truncate">
                <div 
                  className="w-2 h-2 rounded-full flex-none"
                  style={{
                    background: isSelectedActive 
                      ? 'rgb(var(--gc-info))' 
                      : (contextMenu.pc.state === 'offline' ? 'rgb(var(--gc-error))' : contextMenu.pc.state === 'idle' ? 'rgb(var(--gc-primary))' : contextMenu.pc.state === 'locked' ? 'rgb(var(--gc-error))' : 'rgb(var(--gc-info))')
                  }}
                />
                <span className="font-bold text-text-primary tracking-wide truncate">
                  {isSelectedActive ? `Aksi Masal (${selectedPcIds.length} PC)` : contextMenu.pc.name}
                </span>
              </div>
              <span className="text-[10px] font-mono text-text-muted">
                {isSelectedActive ? 'Multi-PC' : (contextMenu.pc.ip || 'Offline')}
              </span>
            </div>

            {/* If multi-selected cards */}
            {isSelectedActive ? (
              <>
                <button
                  onClick={() => {
                    selectedWorkstations.forEach(pc => onActionPc('login_guest_open', pc));
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-primary font-semibold cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5 text-primary" />
                  <span>Buka Sesi Personal ({selectedPcIds.length} PC)</span>
                </button>

                {/* Quick Packages Submenu for Multi-PC */}
                <div 
                  className="relative"
                  onMouseEnter={() => setContextMenu(prev => ({ ...prev, activeSubmenu: 'batch_tambah_paket' }))}
                >
                  <button className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center justify-between text-info font-semibold cursor-pointer">
                    <span className="flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-info" />
                      <span>
                        {selectedWorkstations.filter(w => w.state === 'active_member' || w.state === 'active_guest' || w.state === 'unpaid').length === 0
                          ? `Login Paket (${selectedPcIds.length} PC)`
                          : `Terapkan Paket (${selectedPcIds.length} PC)`}
                      </span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                  </button>

                  {contextMenu.activeSubmenu === 'batch_tambah_paket' && (
                    <div className="absolute top-0 left-full ml-0.5 w-52 bg-surface-2 border border-hairline-strong shadow-2xl rounded-md py-1 max-h-64 overflow-y-auto z-50">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-info uppercase border-b border-hairline">
                        Terapkan ke {selectedPcIds.length} PC:
                      </div>
                      {packageList.map((pkg, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            selectedWorkstations.forEach(pc => {
                              if (pc.state === 'active_member' || pc.state === 'active_guest' || pc.state === 'unpaid') {
                                onActionPc('add_package', pc, pkg);
                              } else {
                                onActionPc('login_package', pc, pkg);
                              }
                            });
                            setContextMenu(prev => ({ ...prev, visible: false }));
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-hairline flex justify-between items-center text-[11px] cursor-pointer"
                        >
                          <span className="text-text-primary font-medium">{pkg.name} • {pkg.time}</span>
                          <span className="text-warning font-mono text-[10px]">Rp {(pkg.price ?? 0).toLocaleString('id-ID')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Batch Lock / Unlock */}
                <button
                  onClick={() => {
                    selectedWorkstations.forEach(pc => onActionPc('lock', pc));
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-warning font-medium cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-warning" />
                  <span>Kunci Layar Masal ({selectedPcIds.length} PC)</span>
                </button>

                <button
                  onClick={() => {
                    selectedWorkstations.forEach(pc => onActionPc('unlock', pc));
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-primary font-medium cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5 text-primary" />
                  <span>Buka Kunci Masal ({selectedPcIds.length} PC)</span>
                </button>

                <button
                  onClick={() => {
                    const activeCount = selectedWorkstations.filter(w => w.state === 'active_member' || w.state === 'active_guest' || w.state === 'unpaid').length;
                    setContextMenu(prev => ({ ...prev, visible: false }));
                    if (activeCount === 0) {
                      selectedWorkstations.forEach(pc => onActionPc('logout', pc));
                      return;
                    }
                    setConfirmDialog({
                      isOpen: true,
                      title: 'Logout Sesi Masal',
                      description: `Hentikan dan logout sesi untuk ${activeCount} komputer yang sedang aktif?`,
                      detail: `Tindakan ini berlaku untuk ${selectedPcIds.length} komputer yang dipilih.`,
                      iconType: 'logout',
                      confirmText: 'Logout Sesi',
                      confirmVariant: 'danger',
                      onConfirm: () => selectedWorkstations.forEach(pc => onActionPc('logout', pc))
                    });
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-error font-semibold cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-error" />
                  <span>Logout Sesi Masal • {selectedPcIds.length} PC</span>
                </button>

                <div className="my-1 border-t border-hairline" />

                <button
                  onClick={() => {
                    handleBatchAction('restart');
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-warning font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-warning" />
                  <span>Restart • {selectedPcIds.length} PC</span>
                </button>

                <button
                  onClick={() => {
                    handleBatchAction('shutdown');
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-error font-medium cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5 text-error" />
                  <span>Shutdown • {selectedPcIds.length} PC</span>
                </button>

                <button
                  onClick={() => {
                    handleBatchAction('wake_on_lan');
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-info font-medium cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-info" />
                  <span>Wake-on-LAN • {selectedPcIds.length} PC</span>
                </button>

                <div className="border-t border-hairline my-1" />

                <button
                  onClick={() => {
                    const count = selectedPcIds.length;
                    setContextMenu(prev => ({ ...prev, visible: false }));
                    setConfirmDialog({
                      isOpen: true,
                      title: 'Hapus Komputer Masal',
                      description: `Yakin ingin menghapus ${count} komputer terpilih dari server?`,
                      detail: 'Seluruh workstation terpilih akan dikeluarkan dari database server.',
                      iconType: 'danger',
                      confirmText: `Hapus ${count} Komputer`,
                      confirmVariant: 'danger',
                      onConfirm: () => selectedWorkstations.forEach(pc => onActionPc('delete_pc', pc))
                    });
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-error/10 flex items-center space-x-2 text-error font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-error" />
                  <span>Hapus Masal • {selectedPcIds.length} PC</span>
                </button>
              </>
            ) : contextMenu.pc.state === 'unpaid' ? (
              <button
                onClick={() => {
                  onActionPc('settle_unpaid', contextMenu.pc!);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-warning font-bold bg-warning/10 cursor-pointer"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Bayar (Rp {(contextMenu.pc.unpaidAmount ?? 0).toLocaleString('id-ID')})</span>
              </button>
            ) : !isCurrentActive ? (
              /* Idle or Offline PC Actions */
              <>
                <button
                  onClick={() => {
                    onActionPc('login_guest_open', contextMenu.pc!);
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-primary font-semibold cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5 text-primary" />
                  <span>Buka Sesi Personal</span>
                </button>

                {/* Quick Packages Submenu */}
                <div 
                  className="relative"
                  onMouseEnter={() => setContextMenu(prev => ({ ...prev, activeSubmenu: 'login_paket_submenu' }))}
                >
                  <button className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center justify-between text-info font-semibold cursor-pointer">
                    <span className="flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-info" />
                      <span>Beli / Login Paket</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                  </button>

                  {contextMenu.activeSubmenu === 'login_paket_submenu' && (
                    <div className="absolute top-0 left-full ml-0.5 w-52 bg-surface-2 border border-hairline-strong shadow-2xl rounded-md py-1 max-h-72 overflow-y-auto z-50">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-info uppercase border-b border-hairline flex items-center justify-between">
                        <span>Pilih Paket Masuk</span>
                      </div>
                      {packageList.map((pkg, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            onActionPc('login_package', contextMenu.pc!, pkg);
                            setContextMenu(prev => ({ ...prev, visible: false }));
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-hairline flex justify-between items-center text-[11px] cursor-pointer"
                        >
                          <span className="text-text-primary font-medium">{pkg.name} ({pkg.time})</span>
                          <span className="text-warning font-mono text-[10px]">Rp {(pkg.price ?? 0).toLocaleString('id-ID')}</span>
                        </button>
                      ))}
                      <div className="border-t border-hairline mt-1 pt-1">
                        <button
                          onClick={() => {
                            onOpenBuyPackageModal(contextMenu.pc!);
                            setContextMenu(prev => ({ ...prev, visible: false }));
                          }}
                          className="w-full text-left px-3 py-1 text-[10.5px] text-text-secondary hover:text-text-primary hover:bg-hairline"
                        >
                          Pilihan Paket Lengkap...
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {contextMenu.pc.state === 'offline' && (
                  <button
                    onClick={() => {
                      onActionPc('wake_on_lan', contextMenu.pc!);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-info cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 text-info" />
                    <span>Nyalakan Komputer (WOL)</span>
                  </button>
                )}
              </>
            ) : (
              /* Active PC Quick Actions */
              <>

                {/* F&B Order shortcut */}
                {contextMenu.pc.hasPendingOrder && (
                  <button
                    onClick={() => {
                      onOpenOrderModal(contextMenu.pc!);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-warning font-bold bg-warning/10 cursor-pointer"
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5 text-warning" />
                    <span>Proses Pesanan F&B</span>
                  </button>
                )}

                {/* Paket hanya untuk sesi prabayar; sesi personal (pascabayar) ditagih per waktu main */}
                {contextMenu.pc.billingType !== 'postpaid' && (
                <>
                {/* 1. Ganti ke Paket > (Legacy Ganti Paket In-Use) */}
                <div 
                  className="relative"
                  onMouseEnter={() => setContextMenu(prev => ({ ...prev, activeSubmenu: 'ganti_paket' }))}
                >
                  <button className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center justify-between text-info font-semibold cursor-pointer">
                    <span className="flex items-center space-x-2">
                      <Package className="w-3.5 h-3.5 text-info" />
                      <span>Ganti ke Paket</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                  </button>

                  {contextMenu.activeSubmenu === 'ganti_paket' && (
                    <div className="absolute top-0 left-full ml-0.5 w-52 bg-surface-2 border border-hairline-strong shadow-2xl rounded-md py-1 max-h-72 overflow-y-auto z-50">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-info uppercase border-b border-hairline flex items-center justify-between">
                        <span>Pilih Paket Pengganti</span>
                      </div>
                      {packageList.map((pkg, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            onActionPc('replace_package', contextMenu.pc!, pkg);
                            setContextMenu(prev => ({ ...prev, visible: false }));
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-hairline flex justify-between items-center text-[11px] cursor-pointer transition"
                        >
                          <span className="text-text-primary font-medium">{pkg.name} ({pkg.time})</span>
                          <span className="text-warning font-mono text-[10px]">Rp {(pkg.price ?? 0).toLocaleString('id-ID')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Tambah Paket > (Legacy Tambah Paket / Stacking) */}
                <div 
                  className="relative"
                  onMouseEnter={() => setContextMenu(prev => ({ ...prev, activeSubmenu: 'tambah_paket' }))}
                >
                  <button className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center justify-between text-primary font-semibold cursor-pointer">
                    <span className="flex items-center space-x-2">
                      <Plus className="w-3.5 h-3.5 text-primary" />
                      <span>Tambah Paket</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                  </button>

                  {contextMenu.activeSubmenu === 'tambah_paket' && (
                    <div className="absolute top-0 left-full ml-0.5 w-52 bg-surface-2 border border-hairline-strong shadow-2xl rounded-md py-1 max-h-72 overflow-y-auto z-50">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-primary uppercase border-b border-hairline flex items-center justify-between">
                        <span>Pilih Paket Tambahan</span>
                      </div>
                      {extendList.map((pkg, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            onActionPc('add_package', contextMenu.pc!, pkg);
                            setContextMenu(prev => ({ ...prev, visible: false }));
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-hairline flex justify-between items-center text-[11px] cursor-pointer transition"
                        >
                          <span className="text-text-primary font-medium">{pkg.name} ({pkg.time})</span>
                          <span className="text-primary font-mono text-[10px]">+{pkg.time}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                </>
                )}

                {/* 3. Pindah Komputer / Transfer Sesi > */}
                <div 
                  className="relative"
                  onMouseEnter={() => setContextMenu(prev => ({ ...prev, activeSubmenu: 'transfer_sesi' }))}
                >
                  <button className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center justify-between text-info font-medium cursor-pointer">
                    <span className="flex items-center space-x-2">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-info" />
                      <span>Pindah Komputer</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                  </button>

                  {contextMenu.activeSubmenu === 'transfer_sesi' && (
                    <div className="absolute top-0 left-full ml-0.5 w-52 bg-surface-2 border border-hairline-strong shadow-2xl rounded-md py-1 max-h-72 overflow-y-auto z-50">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-info uppercase border-b border-hairline flex items-center justify-between">
                        <span>Pilih Komputer Tujuan</span>
                      </div>
                      {availableDestinationPcs.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-text-muted italic text-center">
                          Tidak ada PC kosong
                        </div>
                      ) : (
                        availableDestinationPcs.map((dst) => (
                          <button
                            key={dst.id}
                            onClick={() => {
                              onActionPc('transfer_session', contextMenu.pc!, dst);
                              setContextMenu(prev => ({ ...prev, visible: false }));
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-hairline flex justify-between items-center text-[11px] cursor-pointer transition"
                          >
                            <span className="text-text-primary font-medium">{dst.name}</span>
                            <span className="text-[10px] font-semibold text-primary">
                              {dst.state === 'idle' ? 'Tersedia' : 'Standby'}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* 4. Kunci Layar (AFK Lock) / Buka Kunci (Resume) */}
                {contextMenu.pc.state === 'locked' ? (
                  <button
                    onClick={() => {
                      onActionPc('unlock', contextMenu.pc!);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-primary font-medium cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5 text-primary" />
                    <span>Buka Kunci Komputer</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onActionPc('lock', contextMenu.pc!);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-warning font-medium cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-warning" />
                    <span>Kunci Layar (AFK Lock)</span>
                  </button>
                )}

                {/* 5. Modal Lengkap Kelola Paket */}
                <button
                  onClick={() => {
                    onOpenBuyPackageModal(contextMenu.pc!);
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-text-secondary font-medium cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-text-muted" />
                  <span>Pilihan Paket Lengkap...</span>
                </button>

                {/* Refund Sisa Waktu: hanya sesi prabayar yang dibayar (aturan sama dengan BillingEngine.refundSession) */}
                {contextMenu.pc && contextMenu.pc.billingType !== 'postpaid' && contextMenu.pc.billingType !== 'member' && (contextMenu.pc.moneyUsed || 0) > 0 && (
                  <button
                    onClick={() => {
                      const targetPc = contextMenu.pc;
                      setContextMenu(prev => ({ ...prev, visible: false }));
                      if (!targetPc) return;
                      onActionPc('open_refund', targetPc);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-error font-medium cursor-pointer"
                  >
                    <Banknote className="w-3.5 h-3.5 text-error" />
                    <span>Refund Sisa Waktu</span>
                  </button>
                )}

                {/* 6. Logout Sesi */}
                <button
                  onClick={() => {
                    onActionPc('logout', contextMenu.pc!);
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-error font-medium cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-error" />
                  <span>Selesai Main / Logout</span>
                </button>
              </>
            )}

            {/* Common Management Submenu */}
            <div className="border-t border-hairline my-1" />

            {/* Kontrol & Remote Submenu */}
            <div 
              className="relative"
              onMouseEnter={() => setContextMenu(prev => ({ ...prev, activeSubmenu: 'kontrol' }))}
            >
              <button className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center justify-between cursor-pointer">
                <span className="flex items-center space-x-2">
                  <Monitor className="w-3.5 h-3.5 text-info" />
                  <span>Kontrol & Remote</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
              </button>

              {contextMenu.activeSubmenu === 'kontrol' && (
                <div className="absolute top-0 left-full ml-0.5 w-48 bg-surface-2 border border-hairline-strong shadow-2xl rounded-md py-1 z-50">
                  <button
                    onClick={() => {
                      if (onOpenTaskManagerModal && contextMenu.pc) {
                        onOpenTaskManagerModal(contextMenu.pc);
                      }
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-primary font-semibold cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5 text-primary" />
                    <span>Task Manager Klien</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenVolumeModal(contextMenu.pc!);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-text-secondary" />
                    <span>Atur Volume Suara</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenScreenshotModal(contextMenu.pc!);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-text-secondary" />
                    <span>Lihat Layar (Screenshot)</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenVncModal(contextMenu.pc!);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 cursor-pointer"
                  >
                    <Monitor className="w-3.5 h-3.5 text-text-secondary" />
                    <span>Remote Desktop (VNC)</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenChatModal(contextMenu.pc!);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-text-secondary" />
                    <span>Kirim Pesan Chat</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                onActionPc('restart', contextMenu.pc!);
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-warning cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart Komputer</span>
            </button>

            <button
              onClick={() => {
                onActionPc('shutdown', contextMenu.pc!);
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-hairline flex items-center space-x-2 text-error cursor-pointer"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Matikan Komputer</span>
            </button>

            <div className="border-t border-hairline my-1" />

            <button
              onClick={() => {
                const targetPc = contextMenu.pc;
                setContextMenu(prev => ({ ...prev, visible: false }));
                if (!targetPc) return;
                setConfirmDialog({
                  isOpen: true,
                  title: 'Hapus Komputer',
                  description: `Hapus bilik ${targetPc.name} dari daftar server?`,
                  detail: 'Data sesi, konfigurasi workstation, dan riwayat bilik ini akan dihapus dari server.',
                  iconType: 'danger',
                  confirmText: 'Hapus Komputer',
                  confirmVariant: 'danger',
                  onConfirm: () => onActionPc('delete_pc', targetPc)
                });
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-error/10 flex items-center space-x-2 text-error font-semibold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-error" />
              <span>Hapus Komputer dari Server</span>
            </button>
          </div>
        );
      })()}

      {/* Global Dark Theme Confirm Modal */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        detail={confirmDialog.detail}
        iconType={confirmDialog.iconType}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        confirmVariant={confirmDialog.confirmVariant}
        onConfirm={confirmDialog.onConfirm}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
