import React from 'react';
import {
  Monitor, Users, ShoppingCart, ReceiptText, BarChart2,
  ClipboardList, Settings, ChevronRight, ChevronLeft
} from 'lucide-react';

export type MainTabType = 'komputer' | 'pos' | 'account' | 'transaksi' | 'laporan' | 'log' | 'pengaturan';

interface NavItem {
  id: MainTabType;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
  hotkey: string;
  badge?: number;
  badgeType?: 'danger' | 'warning' | 'info';
  section: 'operasional' | 'manajemen';
}

interface AppNavRailProps {
  activeTab: MainTabType;
  isExpanded: boolean;
  unpaidCount?: number;
  pendingOrderCount?: number;
  onTabChange: (tab: MainTabType, subTab?: string) => void;
  onToggleExpand: () => void;
}

export const AppNavRail: React.FC<AppNavRailProps> = ({
  activeTab,
  isExpanded,
  unpaidCount = 0,
  pendingOrderCount = 0,
  onTabChange,
  onToggleExpand,
}) => {
  const navItems: NavItem[] = [
    // --- SECTION 1: OPERASIONAL KASIR HARIAN (High Priority) ---
    { 
      id: 'komputer', 
      label: 'Komputer Monitor', 
      shortLabel: 'Komputer', 
      icon: Monitor, 
      hotkey: 'F1', 
      badge: unpaidCount > 0 ? unpaidCount : undefined, 
      badgeType: 'danger',
      section: 'operasional'
    },
    { 
      id: 'pos', 
      label: 'POS Kasir / F&B', 
      shortLabel: 'POS Kasir', 
      icon: ShoppingCart, 
      hotkey: 'F2', 
      badge: pendingOrderCount > 0 ? pendingOrderCount : undefined, 
      badgeType: 'warning',
      section: 'operasional'
    },
    { 
      id: 'account', 
      label: 'Account Member', 
      shortLabel: 'Account', 
      icon: Users, 
      hotkey: 'F3', 
      section: 'operasional'
    },
    { 
      id: 'transaksi', 
      label: 'Riwayat Transaksi', 
      shortLabel: 'Transaksi', 
      icon: ReceiptText, 
      hotkey: 'F4', 
      section: 'operasional'
    },

    // --- SECTION 2: AUDIT & PENGATURAN SISTEM (Periodic / Maintenance) ---
    { 
      id: 'laporan', 
      label: 'Laporan & Audit', 
      shortLabel: 'Laporan', 
      icon: BarChart2, 
      hotkey: 'F5', 
      section: 'manajemen'
    },
    { 
      id: 'log', 
      label: 'Log Aktivitas', 
      shortLabel: 'Log', 
      icon: ClipboardList, 
      hotkey: 'F6', 
      section: 'manajemen'
    },
    { 
      id: 'pengaturan', 
      label: 'Pusat Pengaturan', 
      shortLabel: 'Pengaturan', 
      icon: Settings, 
      hotkey: 'F7', 
      section: 'manajemen'
    },
  ];

  return (
    <nav
      className="flex-none flex flex-col justify-between select-none z-40 transition-all duration-200 ease-out border-r"
      style={{
        width: isExpanded ? '190px' : '52px',
        background: 'rgb(var(--gc-surface-1))',
        borderColor: 'rgb(var(--gc-hairline))',
      }}
    >
      {/* Top: Navigation Items Ordered by Operator Use-Case */}
      <div className="flex flex-col pt-2 space-y-1 px-1.5 overflow-y-auto no-scrollbar">
        {/* Section 1: Operasional Label (Expanded only) */}
        {isExpanded && (
          <div className="px-2.5 pt-1 pb-0.5 text-[9.5px] font-extrabold uppercase tracking-widest text-text-disabled">
            Operasional Kasir
          </div>
        )}

        {navItems.filter(i => i.section === 'operasional').map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={!isExpanded ? `${item.shortLabel} (${item.hotkey})` : undefined}
              className={`
                group relative flex items-center w-full rounded-md transition-all duration-150
                ${isExpanded ? 'px-3 py-2 space-x-2.5' : 'justify-center py-2.5 px-0'}
              `}
              style={{
                background: isActive ? 'rgb(var(--gc-surface-3))' : 'transparent',
                color: isActive ? 'rgb(var(--gc-primary))' : 'rgb(var(--gc-text-muted))',
                borderLeft: isActive ? '3px solid rgb(var(--gc-primary))' : '3px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgb(var(--gc-surface-2))';
                  e.currentTarget.style.color = 'rgb(var(--gc-text-primary))';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgb(var(--gc-text-muted))';
                }
              }}
            >
              <div className="relative flex items-center justify-center">
                <Icon 
                  className="w-4 h-4 flex-none transition-transform group-hover:scale-110" 
                  style={{ color: isActive ? 'rgb(var(--gc-primary))' : 'inherit' }}
                />
                {/* Collapsed Badge Pill */}
                {!isExpanded && item.badge !== undefined && (
                  <span className={`absolute -top-1.5 -right-2 w-3.5 h-3.5 rounded-full text-[9px] font-bold flex items-center justify-center ${
                    item.badgeType === 'danger' ? 'bg-error text-white animate-pulse' : 'bg-warning text-black font-bold'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </div>

              {isExpanded && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="text-[12px] font-bold tracking-tight truncate">
                    {item.shortLabel}
                  </span>
                  <div className="flex items-center space-x-1 flex-none ml-1">
                    {item.badge !== undefined && (
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        item.badgeType === 'danger' ? 'bg-error/20 text-error border border-error/40' : 'bg-warning/20 text-warning border border-warning/40'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-text-disabled px-1 py-0.5 rounded bg-surface-2 border border-hairline">
                      {item.hotkey}
                    </span>
                  </div>
                </div>
              )}

              {/* Tooltip in collapsed state */}
              {!isExpanded && (
                <div
                  className="
                    pointer-events-none absolute left-full ml-2 px-2.5 py-1 rounded
                    bg-surface-3 text-text-primary text-[11px] font-semibold whitespace-nowrap
                    opacity-0 group-hover:opacity-100 transition-opacity duration-150
                    border border-hairline-strong shadow-xl z-50 flex items-center space-x-1.5
                  "
                >
                  <span>{item.label}</span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-surface-1 text-primary border border-hairline-strong">
                    {item.hotkey}
                  </span>
                </div>
              )}
            </button>
          );
        })}

        {/* Divider between sections */}
        <div className="my-1.5 border-t border-surface-carbon" />

        {/* Section 2: Manajemen & Audit Label (Expanded only) */}
        {isExpanded && (
          <div className="px-2.5 pt-1 pb-0.5 text-[9.5px] font-extrabold uppercase tracking-widest text-text-disabled">
            Audit &amp; Kontrol
          </div>
        )}

        {navItems.filter(i => i.section === 'manajemen').map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={!isExpanded ? `${item.shortLabel} (${item.hotkey})` : undefined}
              className={`
                group relative flex items-center w-full rounded-md transition-all duration-150
                ${isExpanded ? 'px-3 py-2 space-x-2.5' : 'justify-center py-2.5 px-0'}
              `}
              style={{
                background: isActive ? 'rgb(var(--gc-surface-3))' : 'transparent',
                color: isActive ? 'rgb(var(--gc-primary))' : 'rgb(var(--gc-text-muted))',
                borderLeft: isActive ? '3px solid rgb(var(--gc-primary))' : '3px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgb(var(--gc-surface-2))';
                  e.currentTarget.style.color = 'rgb(var(--gc-text-primary))';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgb(var(--gc-text-muted))';
                }
              }}
            >
              <Icon 
                className="w-4 h-4 flex-none transition-transform group-hover:scale-110" 
                style={{ color: isActive ? 'rgb(var(--gc-primary))' : 'inherit' }}
              />

              {isExpanded && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="text-[12px] font-bold tracking-tight truncate">
                    {item.shortLabel}
                  </span>
                  <span className="text-[10px] font-mono text-text-disabled px-1 py-0.5 rounded bg-surface-2 border border-hairline flex-none ml-1">
                    {item.hotkey}
                  </span>
                </div>
              )}

              {/* Tooltip in collapsed state */}
              {!isExpanded && (
                <div
                  className="
                    pointer-events-none absolute left-full ml-2 px-2.5 py-1 rounded
                    bg-surface-3 text-text-primary text-[11px] font-semibold whitespace-nowrap
                    opacity-0 group-hover:opacity-100 transition-opacity duration-150
                    border border-hairline-strong shadow-xl z-50 flex items-center space-x-1.5
                  "
                >
                  <span>{item.label}</span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-surface-1 text-primary border border-hairline-strong">
                    {item.hotkey}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom: Sidebar Expand / Collapse Switcher */}
      <div className="flex flex-col pb-2 px-1.5 border-t border-surface-carbon">
        <button
          onClick={onToggleExpand}
          title={isExpanded ? 'Sembunyikan Sidebar' : 'Buka Sidebar'}
          className={`
            flex items-center w-full rounded py-2 transition text-text-muted hover:text-text-primary hover:bg-surface-2
            ${isExpanded ? 'px-3 justify-between' : 'justify-center'}
          `}
        >
          {isExpanded && <span className="text-[10px] uppercase font-bold tracking-wider">Tutup Sidebar</span>}
          {isExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </nav>
  );
};
