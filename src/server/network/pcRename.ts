import { ServerNetworkBridge } from './serverNetwork';
import { BillingEngine } from '../engine/billingEngine';
import { DbService } from '../db/dbService';
import { SupabaseSyncService } from '../services/supabaseSyncService';
import { OpCode, type RenamePcPayload, type RenamePcResultPayload } from '../../shared/protocol';
import { pcNameError } from '../../shared/pcName';

// Renaming a PC from the cashier. The name is the booth's identity and lives in its own
// client-config.json, so this is a round trip: the server renames the row first (so the booth's next
// register finds it), asks the booth to save the name, and puts the old name back if the booth refuses
// or does not answer. Only a rename the server asked for is accepted, so a booth cannot take another
// PC's name on its own.

export const RENAME_TIMEOUT_MS = 10_000;

type RenameResult = { success: boolean; message: string };
const pending = new Map<string, { oldName: string; newName: string; timer: NodeJS.Timeout; resolve: (res: RenameResult) => void }>();

function finish(clientPcId: string, result: RenamePcResultPayload | undefined, timedOut = false): void {
  const key = clientPcId.trim().toUpperCase();
  const entry = pending.get(key);
  if (!entry || (!timedOut && result?.name !== entry.newName)) return;
  clearTimeout(entry.timer);
  pending.delete(key);
  if (!timedOut && result?.success) {
    SupabaseSyncService.renamePc(entry.oldName, entry.newName);
    entry.resolve({ success: true, message: `Nama PC ${entry.oldName} diganti jadi ${entry.newName}.` });
    return;
  }
  // ponytail: a booth that saved the name but whose answer was lost registers under the new name and
  // gets a fresh row next to the restored one; delete the stale row from the inspector if that happens.
  DbService.renameWorkstation(entry.newName, entry.oldName);
  BillingEngine.notifyListeners();
  entry.resolve({
    success: false,
    message: timedOut
      ? `${entry.oldName} tidak menjawab, nama tidak diganti. Coba lagi.`
      : `${entry.oldName} gagal menyimpan nama baru: ${result?.message || 'tanpa keterangan'}.`
  });
}

/** Listen for the booths' answers. Call once when the server network starts. */
export function initPcRename(): void {
  ServerNetworkBridge.on(OpCode.REMOTE_COMMAND, (client, packet) => {
    if (packet.payload?.action === 'rename_pc_result') finish(client.pcId, packet.payload.params as RenamePcResultPayload);
  });
}

/** Rename a connected, free PC. Resolves once the booth has saved the name, refused, or timed out. */
export async function requestPcRename(pcId: unknown, name: unknown): Promise<RenameResult> {
  if (typeof pcId !== 'string' || !pcId.trim()) return { success: false, message: 'PC tidak valid.' };
  const nameError = pcNameError(name);
  if (nameError) return { success: false, message: nameError };
  const oldName = pcId.trim();
  const newName = (name as string).trim();
  if (newName === oldName) return { success: false, message: 'Nama baru sama dengan nama sekarang.' };
  const key = oldName.toUpperCase();
  if (pending.has(key)) return { success: false, message: `Penggantian nama ${oldName} masih menunggu jawaban PC.` };
  const client = ServerNetworkBridge.getConnectedClients()
    .find(c => c.pcId.toUpperCase() === key || (c.pcName || '').toUpperCase() === key);
  if (!client) return { success: false, message: `${oldName} tidak tersambung. Nama PC disimpan di PC itu sendiri, jadi nyalakan dulu.` };

  const renamed = BillingEngine.renameWorkstation(oldName, newName);
  if (!renamed.success) return renamed;
  return new Promise(resolve => {
    const timer = setTimeout(() => finish(client.pcId, undefined, true), RENAME_TIMEOUT_MS);
    pending.set(client.pcId.toUpperCase(), { oldName, newName, timer, resolve });
    const payload: RenamePcPayload = { name: newName };
    ServerNetworkBridge.sendToClient(client.pcId, OpCode.REMOTE_COMMAND, { action: 'rename_pc', params: payload });
  });
}
