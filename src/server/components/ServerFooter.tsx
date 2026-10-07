import React from 'react';

interface ServerFooterProps {
  totalMembers?: number;
  totalClients?: number;
  onlineCount?: number;
  availableCount?: number;
  disconnectedCount?: number;
  priceRate?: string;
  version?: string;
}

export const ServerFooter: React.FC<ServerFooterProps> = ({
  totalMembers = 0,
  totalClients = 0,
  onlineCount = 0,
  availableCount = 0,
  disconnectedCount = 0,
  priceRate = '100%',
  version = 'v1.8.6'
}) => {
  return (
    <footer className="flex-none flex items-center justify-between px-4 py-1.5 select-none text-[11px] font-medium overflow-hidden bg-surface-1 border-t border-hairline text-text-muted">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-semibold text-text-primary whitespace-nowrap">
          GC Hub Server <span className="font-mono text-text-disabled">{version}</span>
        </span>

        <span className="text-hairline" aria-hidden>|</span>

        <span className="whitespace-nowrap">
          Member: <strong className="text-text-primary font-mono tabular">{totalMembers}</strong>
        </span>
        <span className="text-hairline" aria-hidden>|</span>
        <span className="whitespace-nowrap">
          Klien: <strong className="text-text-primary font-mono tabular">{totalClients}</strong>
        </span>
      </div>

      <div className="flex items-center gap-3 min-w-0">
        <span className="whitespace-nowrap">
          Online: <strong className="text-primary font-mono tabular">{onlineCount}</strong>
        </span>
        <span className="text-hairline" aria-hidden>|</span>
        <span className="whitespace-nowrap">
          Tersedia: <strong className="text-text-secondary font-mono tabular">{availableCount}</strong>
        </span>
        <span className="text-hairline" aria-hidden>|</span>
        <span className="whitespace-nowrap">
          Terputus: <strong className="text-error font-mono tabular">{disconnectedCount}</strong>
        </span>
        <span className="text-hairline" aria-hidden>|</span>
        <span className="whitespace-nowrap">
          Tarif: <strong className="text-text-primary font-mono tabular">{priceRate}</strong>
        </span>
      </div>
    </footer>
  );
};
