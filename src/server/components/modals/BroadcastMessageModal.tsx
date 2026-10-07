import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Modal, Field, INPUT, BTN_PRIMARY, BTN_SECONDARY, FOCUS } from '../../../shared/ui/primitives';
import { cn } from '../../../shared/ui/utils';

type Priority = 'normal' | 'warning' | 'urgent';

interface BroadcastMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendBroadcast: (params: { message: string; title: string; priority: Priority }) => void;
  onlineCount: number;
}

const PRIORITIES: { id: Priority; label: string; active: string }[] = [
  { id: 'normal', label: 'Info', active: 'bg-info/15 text-info border-info/40' },
  { id: 'warning', label: 'Peringatan', active: 'bg-warning/15 text-warning border-warning/40' },
  { id: 'urgent', label: 'Penting', active: 'bg-error/15 text-error border-error/40' },
];

const TEMPLATES: { label: string; text: string; priority: Priority }[] = [
  { label: 'Tutup 15 menit lagi', text: 'Warnet tutup dalam 15 menit. Simpan game dan pekerjaan kamu sekarang.', priority: 'warning' },
  { label: 'Menu makanan', text: 'Snack, mi instan, dan minuman dingin bisa dipesan langsung dari widget di desktop.', priority: 'normal' },
  { label: 'Dilarang merokok', text: 'Dilarang merokok di area ber-AC. Terima kasih sudah menjaga kenyamanan bersama.', priority: 'warning' },
  { label: 'Gangguan jaringan', text: 'Sedang ada perbaikan jaringan sebentar. Jangan logout, sesi kamu aman.', priority: 'urgent' },
];

const MAX_LENGTH = 300;

export const BroadcastMessageModal: React.FC<BroadcastMessageModalProps> = ({ isOpen, onClose, onSendBroadcast, onlineCount }) => {
  const [title, setTitle] = useState('Pengumuman');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');

  if (!isOpen) return null;

  const canSend = !!message.trim() && onlineCount > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    onSendBroadcast({ message: message.trim(), title: title.trim() || 'Pengumuman', priority });
    setMessage('');
    onClose();
  };

  return (
    <Modal title="Kirim pengumuman" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <p className="text-[13px] text-text-secondary">
          Muncul di <strong className="font-mono tabular text-text-primary">{onlineCount}</strong> PC yang sedang terhubung. PC yang mati tidak menerima pengumuman ini.
        </p>

        <div>
          <span className="block mb-1 text-[12px] font-medium text-text-secondary">Template</span>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map(t => (
              <button
                key={t.label}
                type="button"
                onClick={() => { setMessage(t.text); setTitle(t.label); setPriority(t.priority); }}
                className={`h-7 px-2.5 rounded-sm border border-hairline bg-surface-1 text-[12px] text-text-secondary hover:text-text-primary hover:border-hairline-strong ${FOCUS}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span id="broadcast-priority" className="block mb-1 text-[12px] font-medium text-text-secondary">Tingkat</span>
          <div role="group" aria-labelledby="broadcast-priority" className="flex gap-1.5">
            {PRIORITIES.map(p => (
              <button
                key={p.id}
                type="button"
                aria-pressed={priority === p.id}
                onClick={() => setPriority(p.id)}
                className={`h-8 px-3 rounded-sm border text-[12px] font-medium ${FOCUS} ${priority === p.id ? p.active : 'border-hairline text-text-muted hover:text-text-primary'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Judul" htmlFor="broadcast-title">
          <input id="broadcast-title" type="text" maxLength={60} value={title} onChange={e => setTitle(e.target.value)} className={INPUT} />
        </Field>

        <Field label="Pesan" htmlFor="broadcast-message" hint={`${message.length} dari ${MAX_LENGTH} karakter`}>
          <textarea
            id="broadcast-message"
            rows={4}
            maxLength={MAX_LENGTH}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Tulis pengumuman untuk pelanggan"
            autoFocus
            className={cn(INPUT, 'h-auto py-2 resize-none')}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Batal</button>
          <button type="submit" disabled={!canSend} className={BTN_PRIMARY}>
            <Send className="w-3.5 h-3.5" aria-hidden />
            Kirim
          </button>
        </div>
      </form>
    </Modal>
  );
};
