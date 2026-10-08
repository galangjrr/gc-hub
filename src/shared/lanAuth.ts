import type { Packet, ServerCommandAuth } from './protocol';

// HMAC-SHA256 untuk paket WebSocket LAN. Web Crypto tersedia di renderer Electron dan Node 20,
// jadi server dan client memakai kode yang sama.
// ponytail: anti-replay hanya jendela waktu MAX_SKEW_MS, bukan nonce. Replay dalam 5 menit masih mungkin;
// upgrade ke nonce/sequence number per koneksi jika dibutuhkan.
export const MAX_SKEW_MS = 5 * 60 * 1000;

const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    keyCache.set(secret, key);
  }
  return key;
}

function signingInput(packet: Packet): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${packet.op}|${packet.ts}|${packet.pcId ?? ''}|${JSON.stringify(packet.payload ?? null)}`);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function signPacket(secret: string, packet: Packet): Promise<Packet> {
  const sig = await globalThis.crypto.subtle.sign('HMAC', await getKey(secret), signingInput(packet));
  return { ...packet, sig: toHex(sig) };
}

// Proof that the server accepted an admin login for one booth challenge. The booth's main process
// issues the nonce and checks this, so a renderer that never sees the LAN key cannot fake an admin.
// The 'gc-admin-grant|' input can never equal a packet's signing input, which starts with an OpCode.
export const ADMIN_GRANT_TTL_MS = 15 * 60 * 1000;

function grantInput(nonce: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`gc-admin-grant|${nonce}`);
}

export async function signAdminGrant(secret: string, nonce: string): Promise<string> {
  return toHex(await globalThis.crypto.subtle.sign('HMAC', await getKey(secret), grantInput(nonce)));
}

export async function verifyAdminGrant(secret: string, nonce: string, grant: unknown): Promise<boolean> {
  const sig = typeof grant === 'string' ? fromHex(grant) : null;
  if (!secret || !sig) return false;
  return globalThis.crypto.subtle.verify('HMAC', await getKey(secret), sig, grantInput(nonce));
}

// Server -> booth commands that the booth's main process applies itself because they loosen the booth
// (kiosk off, exe allowlist). The renderer only relays them and cannot forge one: 'gc-server-cmd|' never
// equals a packet's signing input. ponytail: replay inside MAX_SKEW_MS is possible, same as packets.
function commandInput(action: string, ts: number, body: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`gc-server-cmd|${action}|${ts}|${JSON.stringify(body)}`);
}

export async function signServerCommand(secret: string, action: string, body: unknown, ts = Date.now()): Promise<ServerCommandAuth> {
  const sig = await globalThis.crypto.subtle.sign('HMAC', await getKey(secret), commandInput(action, ts, body));
  return { ts, proof: toHex(sig) };
}

export async function verifyServerCommand(secret: string, action: string, body: unknown, auth: unknown, now = Date.now()): Promise<boolean> {
  const a = auth as Partial<ServerCommandAuth> | null | undefined;
  if (!secret || !a || typeof a.ts !== 'number' || Math.abs(now - a.ts) > MAX_SKEW_MS) return false;
  const sig = typeof a.proof === 'string' ? fromHex(a.proof) : null;
  if (!sig) return false;
  return globalThis.crypto.subtle.verify('HMAC', await getKey(secret), sig, commandInput(action, a.ts, body));
}

export async function verifyPacket(secret: string, packet: Packet, now = Date.now()): Promise<boolean> {
  if (!packet || typeof packet.ts !== 'number' || Math.abs(now - packet.ts) > MAX_SKEW_MS) return false;
  const sig = typeof packet.sig === 'string' ? fromHex(packet.sig) : null;
  if (!sig) return false;
  // subtle.verify membandingkan secara constant-time
  return globalThis.crypto.subtle.verify('HMAC', await getKey(secret), sig, signingInput(packet));
}
