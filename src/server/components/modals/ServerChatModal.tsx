import React, { useState, useEffect, useRef } from 'react';
import { Workstation } from '../../../shared/types';
import { X, Send, Minus, ChevronUp } from 'lucide-react';
import { FOCUS, INPUT } from '../settingsUi';

export interface ChatMessageItem {
  sender: string;
  time: string;
  text: string;
  isClient: boolean;
}

interface ServerChatModalProps {
  isOpen: boolean;
  pc: Workstation | null;
  onClose: () => void;
  /** Resolves false when the PC is not connected and the message was not delivered. */
  onSendMessage: (pc: Workstation, text: string) => Promise<boolean>;
  messages?: ChatMessageItem[];
}

const ICON_BTN = `w-7 h-7 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3 ${FOCUS}`;

// Docked bottom-right like a messenger window so the operator can keep working the grid.
export const ServerChatModal: React.FC<ServerChatModalProps> = ({ isOpen, pc, onClose, onSendMessage, messages = [] }) => {
  const [inputText, setInputText] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && !isMinimized) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpen, isMinimized]);

  useEffect(() => setSendError(null), [pc?.name]);

  if (!isOpen || !pc) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    const delivered = await onSendMessage(pc, text);
    setSending(false);
    if (!delivered) {
      setSendError(`${pc.name} tidak terhubung. Pesan belum terkirim.`);
      return;
    }
    setSendError(null);
    setInputText('');
  };

  const isOnline = pc.state !== 'offline';

  return (
    <section
      aria-label={`Chat dengan ${pc.name}`}
      className="fixed bottom-0 right-12 z-40 w-[340px] flex flex-col bg-surface-2 border border-hairline border-b-0 rounded-t-md shadow-modal"
      onClick={e => e.stopPropagation()}
    >
      <header className="flex items-center gap-2 pl-3 pr-1.5 h-11 border-b border-hairline">
        <span className={`w-2 h-2 rounded-full flex-none ${isOnline ? 'bg-success' : 'bg-text-disabled'}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold text-text-primary truncate">{pc.name}</h2>
          <p className="text-[11px] text-text-muted truncate">{pc.username || 'Tanpa pengguna'} · {isOnline ? 'Terhubung' : 'Offline'}</p>
        </div>
        <button type="button" onClick={() => setIsMinimized(v => !v)} aria-label={isMinimized ? 'Buka chat' : 'Kecilkan chat'} aria-expanded={!isMinimized} className={ICON_BTN}>
          {isMinimized ? <ChevronUp className="w-4 h-4" aria-hidden /> : <Minus className="w-4 h-4" aria-hidden />}
        </button>
        <button type="button" onClick={onClose} aria-label="Tutup chat" className={ICON_BTN}>
          <X className="w-4 h-4" aria-hidden />
        </button>
      </header>

      {!isMinimized && (
        <>
          <div ref={scrollRef} role="log" aria-live="polite" className="h-64 overflow-y-auto custom-scrollbar p-3 space-y-2.5 bg-surface-1">
            {messages.length === 0 ? (
              <p className="h-full flex items-center justify-center text-center text-[12px] text-text-muted">
                Belum ada pesan dengan {pc.name}.
              </p>
            ) : (
              messages.map((m, idx) => (
                <div key={idx} className={`flex flex-col ${m.isClient ? 'items-start' : 'items-end'}`}>
                  <div className="mb-0.5 text-[11px] text-text-muted">
                    <span className="font-medium text-text-secondary">{m.isClient ? (m.sender || pc.name) : 'Kasir'}</span>
                    <span className="font-mono tabular ml-1.5">{m.time}</span>
                  </div>
                  <div
                    className={`max-w-[85%] px-3 py-1.5 rounded-md text-[13px] leading-relaxed break-words ${
                      m.isClient ? 'bg-surface-3 text-text-primary' : 'bg-primary text-on-primary'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))
            )}
          </div>

          {sendError && <p role="alert" className="px-3 py-1.5 text-[12px] text-error border-t border-hairline">{sendError}</p>}

          <form onSubmit={handleSend} className="flex items-center gap-1.5 p-2 border-t border-hairline">
            <input
              type="text"
              maxLength={200}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Pesan ke ${pc.name}`}
              aria-label={`Pesan ke ${pc.name}`}
              autoFocus
              className={INPUT}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              aria-label="Kirim"
              className={`w-9 h-9 flex-none flex items-center justify-center rounded-sm bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-40 ${FOCUS}`}
            >
              <Send className="w-4 h-4" aria-hidden />
            </button>
          </form>
        </>
      )}
    </section>
  );
};
