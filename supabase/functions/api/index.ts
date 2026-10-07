// Supabase Edge Function "api": GC Hub Booking API v1.
// Deploy: supabase functions deploy api --no-verify-jwt   (auth pakai API key GC Hub, bukan JWT Supabase)
// SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY otomatis tersedia di runtime Edge Function.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHandler, toBusinessError, type ApiDb } from './handler.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function orThrow<T>(result: { data: T; error: { message?: string; code?: string } | null }): T {
  if (result.error) {
    throw toBusinessError(result.error) ?? new Error(result.error.message);
  }
  return result.data;
}

const db: ApiDb = {
  async findKeyByHash(hash) {
    return orThrow(await supabase.from('api_keys').select('id, name, scopes, revoked_at').eq('key_hash', hash).maybeSingle());
  },

  async hit(keyId) {
    return orThrow(await supabase.rpc('api_hit', { p_api_key_id: keyId })) === true;
  },

  async claimIdempotency(keyId, idemKey, requestHash) {
    const { error } = await supabase.from('api_idempotency').insert({ api_key_id: keyId, idem_key: idemKey, request_hash: requestHash });
    if (!error) return null;
    if (error.code !== '23505') throw new Error(error.message);
    return orThrow(await supabase.from('api_idempotency')
      .select('request_hash, status_code, response')
      .eq('api_key_id', keyId).eq('idem_key', idemKey).single());
  },

  async completeIdempotency(keyId, idemKey, statusCode, response) {
    orThrow(await supabase.from('api_idempotency').update({ status_code: statusCode, response }).eq('api_key_id', keyId).eq('idem_key', idemKey));
  },

  async releaseIdempotency(keyId, idemKey) {
    orThrow(await supabase.from('api_idempotency').delete().eq('api_key_id', keyId).eq('idem_key', idemKey));
  },

  async availability(paketId, at) {
    return orThrow(await supabase.rpc('api_availability', { p_paket_id: paketId, p_at: at }));
  },

  async listPakets() {
    const rows = orThrow(await supabase.from('pakets')
      .select('id, name, price, duration_minutes, fixed_start_time, fixed_end_time, days')
      .order('price', { ascending: true }));
    return rows ?? [];
  },

  async createBooking(a) {
    return orThrow(await supabase.rpc('api_create_booking', {
      p_api_key_id: a.apiKeyId,
      p_source: a.source,
      p_booking_type: a.type,
      p_pc_id: a.pcId,
      p_paket_id: a.paketId,
      p_player_name: a.playerName,
      p_scheduled_at: a.scheduledAt,
      p_payment_status: a.paymentStatus,
      p_phone: a.phone,
      p_external_ref: a.externalRef,
      p_payment_ref: a.paymentRef,
    }));
  },

  async getBooking(keyId, id) {
    const owned = orThrow(await supabase.from('bookings').select('id').eq('id', id).eq('api_key_id', keyId).maybeSingle());
    if (!owned) return null;
    return orThrow(await supabase.rpc('api_booking_json', { p_id: id }));
  },

  async cancelBooking(keyId, id, reason) {
    return orThrow(await supabase.rpc('api_cancel_booking', { p_api_key_id: keyId, p_id: id, p_reason: reason }));
  },
};

Deno.serve(createHandler(db));
