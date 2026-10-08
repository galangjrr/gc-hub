-- ==============================================================================
-- 004 BOOKING API: API key, heartbeat server, booking via API, webhook
-- ==============================================================================
-- Aditif terhadap skema GC Net Hub (pcs, pakets, bookings, logs, settings):
-- tabel lama hanya ditambah kolom, tidak ada kolom lama yang diubah/dihapus.
-- Semua tabel baru RLS aktif tanpa policy = hanya service role (Edge Function & GC Hub Server).
--
-- Model booking (lihat docs/flowchart_booking_queue.html):
--   queue : antre di PC tertentu (pc_id wajib). Satu antrean pending per PC.
--   slot  : datang jam tertentu (scheduled_at wajib, pc_id opsional). Dibatasi kapasitas PC.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. BRANCH / CABANG (heartbeat GC Hub Server) -----------------------------------
-- ponytail: tabel lama GC Net Hub belum punya branch_id, jadi API saat ini single-tenant ('main').
-- Upgrade multi-tenant: tambah branch_id ke pcs/pakets/bookings lalu filter di fungsi api_*.
CREATE TABLE IF NOT EXISTS public.branches (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  app_version  TEXT,
  online_pcs   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.branches (id, name) VALUES ('main', 'Warnet Utama') ON CONFLICT (id) DO NOTHING;

-- 2. API KEY ---------------------------------------------------------------------
-- Key asli hanya ditampilkan sekali oleh api_create_key(); yang disimpan hanya SHA-256.
CREATE TABLE IF NOT EXISTS public.api_keys (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id          TEXT NOT NULL DEFAULT 'main' REFERENCES public.branches(id),
  name               TEXT NOT NULL,
  key_prefix         TEXT NOT NULL,
  key_hash           TEXT NOT NULL UNIQUE,
  scopes             TEXT[] NOT NULL DEFAULT ARRAY['read', 'bookings:write'],
  rate_limit_per_min INT NOT NULL DEFAULT 60 CHECK (rate_limit_per_min > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.api_rate_windows (
  api_key_id   UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  hits         INT NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, window_start)
);

-- status_code 0 = request sedang diproses (klaim), mencegah dua request kembar membuat booking ganda
CREATE TABLE IF NOT EXISTS public.api_idempotency (
  api_key_id   UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  idem_key     TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code  INT NOT NULL DEFAULT 0,
  response     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (api_key_id, idem_key)
);

-- 3. WEBHOOK ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id          UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  url                 TEXT NOT NULL CHECK (url ~ '^https://'),
  secret              TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  events              TEXT[] NOT NULL DEFAULT ARRAY['booking.created', 'booking.started', 'booking.completed', 'booking.cancelled', 'booking.reassigned'],
  include_all_sources BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE: ikut terima booking dari web/sumber lain
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id          BIGSERIAL PRIMARY KEY,
  endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event       TEXT NOT NULL,
  booking_id  TEXT NOT NULL,
  request_id  BIGINT, -- id request pg_net (lihat net._http_response untuk status HTTP)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. REMOTE COMMAND (HP owner -> GC Hub Server, dipakai SupabaseSyncService) -------
CREATE TABLE IF NOT EXISTS public.remote_commands (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      TEXT NOT NULL DEFAULT 'main' REFERENCES public.branches(id),
  workstation_id TEXT NOT NULL,
  command        TEXT NOT NULL CHECK (command IN ('lock', 'unlock', 'restart', 'shutdown', 'broadcast_chat', 'start_session', 'add_time', 'replace_package', 'stop_session', 'move_station')),
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed')),
  created_by     TEXT NOT NULL DEFAULT 'owner',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at    TIMESTAMPTZ
);
-- Jika tabel sudah ada dari skema lama (001), samakan kolom & daftar command
ALTER TABLE public.remote_commands ADD COLUMN IF NOT EXISTS branch_id TEXT NOT NULL DEFAULT 'main';
ALTER TABLE public.remote_commands ALTER COLUMN payload SET DEFAULT '{}'::jsonb;
ALTER TABLE public.remote_commands DROP CONSTRAINT IF EXISTS remote_commands_command_check;
ALTER TABLE public.remote_commands ADD CONSTRAINT remote_commands_command_check
  CHECK (command IN ('lock', 'unlock', 'restart', 'shutdown', 'broadcast_chat', 'start_session', 'add_time', 'replace_package', 'stop_session', 'move_station'));
CREATE INDEX IF NOT EXISTS idx_remote_commands_pending ON public.remote_commands (status, created_at) WHERE status = 'pending';

-- 5. KOLOM BARU DI BOOKINGS ------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS branch_id      TEXT NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS source         TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS api_key_id     UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_type   TEXT NOT NULL DEFAULT 'queue' CHECK (booking_type IN ('queue', 'slot')),
  ADD COLUMN IF NOT EXISTS scheduled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS cancel_reason  TEXT,
  ADD COLUMN IF NOT EXISTS started_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Booking slot boleh tanpa PC; id otomatis untuk booking dari API
ALTER TABLE public.bookings ALTER COLUMN pc_id DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN id SET DEFAULT ('bk_' || encode(extensions.gen_random_bytes(8), 'hex'));

CREATE INDEX IF NOT EXISTS idx_bookings_open_pc ON public.bookings (pc_id, status) WHERE status IN ('pending', 'active');
CREATE INDEX IF NOT EXISTS idx_bookings_slot_time ON public.bookings (scheduled_at) WHERE booking_type = 'slot' AND status IN ('pending', 'active');
CREATE INDEX IF NOT EXISTS idx_bookings_api_key ON public.bookings (api_key_id);

-- Data kontak & pembayaran dipisah: tabel bookings saat ini bisa dibaca publik lewat anon key
CREATE TABLE IF NOT EXISTS public.booking_private (
  booking_id   TEXT PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  phone        TEXT,
  external_ref TEXT,
  payment_ref  TEXT
);

-- 6. RLS: tabel baru hanya untuk service role ------------------------------------
ALTER TABLE public.branches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_windows   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_idempotency    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remote_commands    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_private    ENABLE ROW LEVEL SECURITY;

-- 7. FUNGSI ----------------------------------------------------------------------

-- Buat API key baru. Jalankan di SQL Editor: SELECT public.api_create_key('GC Net Booking');
-- Nilai kembalian adalah key asli dan TIDAK bisa dilihat lagi.
CREATE OR REPLACE FUNCTION public.api_create_key(
  p_name TEXT,
  p_scopes TEXT[] DEFAULT ARRAY['read', 'bookings:write'],
  p_branch_id TEXT DEFAULT 'main'
) RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_key TEXT := 'gch_' || encode(extensions.gen_random_bytes(24), 'hex');
BEGIN
  IF coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Nama API key wajib diisi';
  END IF;
  INSERT INTO public.api_keys (branch_id, name, key_prefix, key_hash, scopes)
  VALUES (p_branch_id, trim(p_name), left(v_key, 12), encode(extensions.digest(v_key, 'sha256'), 'hex'), p_scopes);
  RETURN v_key;
END;
$$;

-- Hitung request per menit per key. TRUE = masih dalam batas.
CREATE OR REPLACE FUNCTION public.api_hit(p_api_key_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_hits INT;
  v_limit INT;
BEGIN
  SELECT rate_limit_per_min INTO v_limit FROM public.api_keys WHERE id = p_api_key_id;
  INSERT INTO public.api_rate_windows (api_key_id, window_start, hits)
  VALUES (p_api_key_id, date_trunc('minute', now()), 1)
  ON CONFLICT (api_key_id, window_start) DO UPDATE SET hits = public.api_rate_windows.hits + 1
  RETURNING hits INTO v_hits;

  UPDATE public.api_keys SET last_used_at = now() WHERE id = p_api_key_id;
  DELETE FROM public.api_rate_windows WHERE api_key_id = p_api_key_id AND window_start < now() - interval '5 minutes';
  RETURN v_hits <= coalesce(v_limit, 60);
END;
$$;

-- Bentuk booking yang dikembalikan API (tanpa kolom internal)
CREATE OR REPLACE FUNCTION public.api_booking_json(p_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', b.id,
    'type', b.booking_type,
    'status', b.status,
    'pc_id', b.pc_id,
    'paket_id', b.paket_id,
    'player_name', b.player_name,
    'scheduled_at', b.scheduled_at,
    'payment_status', b.payment_status,
    'phone', p.phone,
    'external_ref', p.external_ref,
    'cancel_reason', b.cancel_reason,
    'created_at', b.created_at,
    'started_at', b.started_at,
    'completed_at', b.completed_at
  )
  FROM public.bookings b
  LEFT JOIN public.booking_private p ON p.booking_id = b.id
  WHERE b.id = p_id;
$$;

-- Status PC + antrean + kapasitas slot. Dipakai GET /v1/availability.
CREATE OR REPLACE FUNCTION public.api_availability(p_paket_id TEXT DEFAULT NULL, p_at TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_minutes INT;
  v_result JSONB;
  v_capacity INT;
  v_used INT;
BEGIN
  SELECT jsonb_build_object(
    'server_online', coalesce((SELECT last_seen_at > now() - interval '90 seconds' FROM public.branches WHERE id = 'main'), FALSE),
    'server_last_seen_at', (SELECT last_seen_at FROM public.branches WHERE id = 'main'),
    'pcs', coalesce(jsonb_agg(jsonb_build_object(
      'id', pc.id,
      'name', pc.name,
      'status', pc.status,
      'expected_empty_time', pc.expected_empty_time,
      'queue_open', pc.status <> 'maintenance' AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.pc_id = pc.id AND b.status = 'pending' AND b.booking_type = 'queue'
      )
    ) ORDER BY pc.id), '[]'::jsonb)
  ) INTO v_result
  FROM public.pcs pc;

  IF p_at IS NOT NULL THEN
    SELECT coalesce(duration_minutes, 60) INTO v_minutes FROM public.pakets WHERE id = p_paket_id;
    v_minutes := coalesce(v_minutes, 60);
    SELECT count(*) INTO v_capacity FROM public.pcs WHERE status <> 'maintenance';
    SELECT count(*) INTO v_used
    FROM public.bookings b
    LEFT JOIN public.pakets k ON k.id = b.paket_id
    WHERE b.booking_type = 'slot' AND b.status IN ('pending', 'active')
      AND tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins => coalesce(k.duration_minutes, 60)))
          && tstzrange(p_at, p_at + make_interval(mins => v_minutes));
    v_result := v_result || jsonb_build_object('slot', jsonb_build_object(
      'at', p_at,
      'minutes', v_minutes,
      'capacity', v_capacity,
      'booked', v_used,
      'remaining', greatest(v_capacity - v_used, 0)
    ));
  END IF;

  RETURN v_result;
END;
$$;

-- Buat booking secara atomik. Error bisnis dilempar sebagai pesan kode (PC_NOT_FOUND, dll)
-- yang dipetakan Edge Function ke HTTP status.
CREATE OR REPLACE FUNCTION public.api_create_booking(
  p_api_key_id     UUID,
  p_source         TEXT,
  p_booking_type   TEXT,
  p_pc_id          TEXT,
  p_paket_id       TEXT,
  p_player_name    TEXT,
  p_scheduled_at   TIMESTAMPTZ DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'unpaid',
  p_phone          TEXT DEFAULT NULL,
  p_external_ref   TEXT DEFAULT NULL,
  p_payment_ref    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_pc public.pcs%ROWTYPE;
  v_minutes INT;
  v_capacity INT;
  v_used INT;
  v_id TEXT;
BEGIN
  IF coalesce(length(trim(p_player_name)), 0) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'INVALID_PLAYER_NAME';
  END IF;
  IF p_booking_type NOT IN ('queue', 'slot') THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TYPE';
  END IF;
  IF p_payment_status NOT IN ('unpaid', 'paid') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_STATUS';
  END IF;

  SELECT coalesce(duration_minutes, 60) INTO v_minutes FROM public.pakets WHERE id = p_paket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAKET_NOT_FOUND';
  END IF;

  -- Serialisasi semua pembuatan booking agar cek antrean/kapasitas tidak balapan
  PERFORM pg_advisory_xact_lock(hashtext('gchub_booking_main'));

  IF p_pc_id IS NOT NULL THEN
    SELECT * INTO v_pc FROM public.pcs WHERE id = p_pc_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PC_NOT_FOUND';
    END IF;
    IF v_pc.status = 'maintenance' THEN
      RAISE EXCEPTION 'PC_MAINTENANCE';
    END IF;
  END IF;

  IF p_booking_type = 'queue' THEN
    IF p_pc_id IS NULL THEN
      RAISE EXCEPTION 'PC_REQUIRED';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bookings WHERE pc_id = p_pc_id AND status = 'pending' AND booking_type = 'queue') THEN
      RAISE EXCEPTION 'PC_QUEUE_FULL';
    END IF;
  ELSE
    IF p_scheduled_at IS NULL THEN
      RAISE EXCEPTION 'SCHEDULE_REQUIRED';
    END IF;
    IF p_scheduled_at < now() + interval '10 minutes' OR p_scheduled_at > now() + interval '7 days' THEN
      RAISE EXCEPTION 'SCHEDULE_OUT_OF_RANGE';
    END IF;

    SELECT count(*) INTO v_capacity FROM public.pcs WHERE status <> 'maintenance';
    SELECT count(*) INTO v_used
    FROM public.bookings b
    LEFT JOIN public.pakets k ON k.id = b.paket_id
    WHERE b.booking_type = 'slot' AND b.status IN ('pending', 'active')
      AND tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins => coalesce(k.duration_minutes, 60)))
          && tstzrange(p_scheduled_at, p_scheduled_at + make_interval(mins => v_minutes));
    IF v_used >= v_capacity THEN
      RAISE EXCEPTION 'SLOT_FULL';
    END IF;

    IF p_pc_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
      LEFT JOIN public.pakets k ON k.id = b.paket_id
      WHERE b.pc_id = p_pc_id AND b.booking_type = 'slot' AND b.status IN ('pending', 'active')
        AND tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins => coalesce(k.duration_minutes, 60)))
            && tstzrange(p_scheduled_at, p_scheduled_at + make_interval(mins => v_minutes))
    ) THEN
      RAISE EXCEPTION 'PC_SLOT_TAKEN';
    END IF;
  END IF;

  INSERT INTO public.bookings (pc_id, paket_id, player_name, status, booking_type, scheduled_at, payment_status, source, api_key_id)
  VALUES (p_pc_id, p_paket_id, trim(p_player_name), 'pending', p_booking_type, p_scheduled_at, p_payment_status, coalesce(p_source, 'api'), p_api_key_id)
  RETURNING id INTO v_id;

  IF p_phone IS NOT NULL OR p_external_ref IS NOT NULL OR p_payment_ref IS NOT NULL THEN
    INSERT INTO public.booking_private (booking_id, phone, external_ref, payment_ref)
    VALUES (v_id, p_phone, p_external_ref, p_payment_ref);
  END IF;

  RETURN public.api_booking_json(v_id);
END;
$$;

-- Batalkan booking milik API key tertentu (hanya status pending)
CREATE OR REPLACE FUNCTION public.api_cancel_booking(p_api_key_id UUID, p_id TEXT, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.bookings WHERE id = p_id AND api_key_id = p_api_key_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'BOOKING_NOT_CANCELLABLE';
  END IF;
  UPDATE public.bookings
  SET status = 'cancelled', cancel_reason = coalesce(nullif(trim(p_reason), ''), 'Dibatalkan oleh pelanggan')
  WHERE id = p_id;
  RETURN public.api_booking_json(p_id);
END;
$$;

-- 8. TRIGGER: updated_at + stempel waktu + webhook -------------------------------
CREATE OR REPLACE FUNCTION public.bookings_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'active' AND NEW.started_at IS NULL THEN NEW.started_at := now(); END IF;
    IF NEW.status IN ('completed', 'cancelled') AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_touch ON public.bookings;
CREATE TRIGGER trg_bookings_touch BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_touch();

-- Kirim webhook via pg_net. Tanda tangan: X-GCHub-Signature = sha256=<hex HMAC(body, secret)>.
-- pg_net tidak retry otomatis; retry ada di 009_webhook_retry.sql, yang mengganti fungsi ini.
CREATE OR REPLACE FUNCTION public.bookings_webhook_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event TEXT;
  v_body JSONB;
  v_endpoint RECORD;
  v_request_id BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'booking.created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE NEW.status
      WHEN 'active' THEN 'booking.started'
      WHEN 'completed' THEN 'booking.completed'
      WHEN 'cancelled' THEN 'booking.cancelled'
      ELSE NULL END;
  ELSIF NEW.pc_id IS DISTINCT FROM OLD.pc_id THEN
    v_event := 'booking.reassigned';
  END IF;

  IF v_event IS NULL OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_endpoint IN
    SELECT e.* FROM public.webhook_endpoints e
    WHERE e.active AND v_event = ANY (e.events)
      AND (e.include_all_sources OR e.api_key_id = NEW.api_key_id)
  LOOP
    BEGIN
      v_body := jsonb_build_object(
        'event', v_event,
        'occurred_at', now(),
        'delivery_id', gen_random_uuid(),
        'data', jsonb_build_object(
          'id', NEW.id, 'type', NEW.booking_type, 'status', NEW.status, 'pc_id', NEW.pc_id,
          'previous_pc_id', CASE WHEN TG_OP = 'UPDATE' THEN OLD.pc_id END,
          'paket_id', NEW.paket_id, 'player_name', NEW.player_name, 'scheduled_at', NEW.scheduled_at,
          'payment_status', NEW.payment_status, 'cancel_reason', NEW.cancel_reason,
          'started_at', NEW.started_at, 'completed_at', NEW.completed_at
        )
      );
      EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
        INTO v_request_id
        USING v_endpoint.url, v_body, jsonb_build_object(
          'Content-Type', 'application/json',
          'X-GCHub-Event', v_event,
          'X-GCHub-Signature', 'sha256=' || encode(extensions.hmac(v_body::text, v_endpoint.secret, 'sha256'), 'hex')
        );
      INSERT INTO public.webhook_deliveries (endpoint_id, event, booking_id, request_id)
      VALUES (v_endpoint.id, v_event, NEW.id, v_request_id);
    EXCEPTION WHEN OTHERS THEN
      -- Webhook gagal tidak boleh membatalkan perubahan booking
      RAISE WARNING 'Webhook % ke % gagal: %', v_event, v_endpoint.url, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_webhook ON public.bookings;
CREATE TRIGGER trg_bookings_webhook AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_webhook_dispatch();

-- 9. HAK AKSES: fungsi API hanya untuk service role ------------------------------
DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.api_create_key(text,text[],text)',
    'public.api_hit(uuid)',
    'public.api_booking_json(text)',
    'public.api_availability(text,timestamptz)',
    'public.api_create_booking(uuid,text,text,text,text,text,timestamptz,text,text,text,text)',
    'public.api_cancel_booking(uuid,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', v_fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
    END IF;
  END LOOP;
END;
$$;

-- 10. REALTIME: GC Hub Server mendengarkan bookings & remote_commands --------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bookings') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'remote_commands') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.remote_commands;
    END IF;
  END IF;
END;
$$;
