import { safeStorage } from 'electron';
import fs from 'fs';

// The LAN key sits next to the exe, and booth players get an admin desktop (UAC off), so a plain key
// could be read in Notepad and used for the offline admin check. It is stored DPAPI-encrypted instead,
// and only main holds it decrypted; the renderer never receives it.
// ponytail: DPAPI only stops reading the file. An admin user can still delete the key and reboot into
// first-setup mode; the real fix is a SYSTEM service owning this file with a non-admin player account.

type ClientConfig = Record<string, unknown> & { lanSecret?: string; lanSecretEnc?: string };

function seal(config: ClientConfig): ClientConfig {
  const { lanSecret, lanSecretEnc: _old, ...rest } = config;
  const secret = typeof lanSecret === 'string' ? lanSecret.trim() : '';
  if (!secret) return rest;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Enkripsi Windows (DPAPI) tidak tersedia, Kunci LAN tidak disimpan.');
  return { ...rest, lanSecretEnc: safeStorage.encryptString(secret).toString('base64') };
}

function write(configPath: string, config: ClientConfig): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

export function saveClientConfig(configPath: string, config: ClientConfig): void {
  write(configPath, seal(config));
}

/** Read the config with `lanSecret` decrypted. A file still holding a plain key is re-sealed on the spot. */
export function loadClientConfig(configPath: string): ClientConfig {
  const stored = JSON.parse(fs.readFileSync(configPath, 'utf8')) as ClientConfig;
  if (typeof stored.lanSecret === 'string' && stored.lanSecret.trim()) {
    const plain = stored.lanSecret.trim();
    try { write(configPath, seal(stored)); } catch (err) { console.warn('[CLIENT CONFIG] Kunci LAN lama belum bisa dienkripsi:', err); }
    const { lanSecretEnc: _enc, ...rest } = stored;
    return { ...rest, lanSecret: plain };
  }
  const { lanSecretEnc, ...rest } = stored;
  if (!lanSecretEnc) return rest;
  try {
    return { ...rest, lanSecret: safeStorage.decryptString(Buffer.from(lanSecretEnc, 'base64')) };
  } catch (err) {
    // Another Windows account or a reset profile: same as a client without a key, re-enter it in booth settings
    console.warn('[CLIENT CONFIG] Kunci LAN tidak bisa dibuka di akun Windows ini:', err);
    return rest;
  }
}
