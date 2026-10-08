-- =====================================================================================
-- GC Hub 009: retry webhook booking
-- pg_net tidak mengulang kiriman yang gagal. Setiap kiriman kini menyimpan body aslinya, dan
-- public.webhook_retry_pending() (dijadwalkan pg_cron tiap menit) membaca hasilnya di
-- net._http_response lalu mengirim ulang dengan jeda 1, 4, 16, 64 menit, maksimal 5 kiriman.
-- Body dikirim ulang persis sama, termasuk delivery_id, jadi penerima bisa membuang duplikat.
-- Aman dijalankan ulang. Butuh 004. Tanpa pg_cron, jalankan SELECT public.webhook_retry_pending()
-- dari mana saja secara berkala.
-- =====================================================================================

ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS body          JSONB,
  ADD COLUMN IF NOT EXISTS attempts      INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error    TEXT,
  ADD COLUMN IF NOT EXISTS sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_status_check') THEN
    ALTER TABLE public.webhook_deliveries
      ADD CONSTRAINT webhook_deliveries_status_check CHECK (status IN ('pending', 'delivered', 'failed'));
  END IF;
END;
$$;

-- Kiriman dari sebelum 009 tidak punya body, jadi tidak bisa diulang
UPDATE public.webhook_deliveries
SET status = 'failed', last_error = 'Dikirim sebelum retry tersedia'
WHERE body IS NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON public.webhook_deliveries (next_retry_at) WHERE status = 'pending';

-- Header bertanda tangan dihitung ulang dari secret endpoint saat ini
CREATE OR REPLACE FUNCTION public.webhook_headers(p_event TEXT, p_body JSONB, p_secret TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'X-GCHub-Event', p_event,
    'X-GCHub-Signature', 'sha256=' || encode(extensions.hmac(p_body::text, p_secret, 'sha256'), 'hex')
  );
$$;

CREATE OR REPLACE FUNCTION public.webhook_post(p_url TEXT, p_body JSONB, p_headers JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RAISE EXCEPTION 'pg_net tidak aktif';
  END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    INTO v_request_id
    USING p_url, p_body, p_headers;
  RETURN v_request_id;
END;
$$;

-- Sama dengan 004, ditambah: body disimpan, dan kiriman pertama yang gagal tetap dicatat untuk diulang
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
  v_error TEXT;
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
      v_request_id := NULL;
      v_error := NULL;
      BEGIN
        v_request_id := public.webhook_post(v_endpoint.url, v_body, public.webhook_headers(v_event, v_body, v_endpoint.secret));
      EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
      END;
      INSERT INTO public.webhook_deliveries (endpoint_id, event, booking_id, request_id, body, last_error, next_retry_at)
      VALUES (v_endpoint.id, v_event, NEW.id, v_request_id, v_body, v_error,
              CASE WHEN v_request_id IS NULL THEN now() + interval '1 minute' END);
    EXCEPTION WHEN OTHERS THEN
      -- Webhook gagal tidak boleh membatalkan perubahan booking
      RAISE WARNING 'Webhook % ke % gagal: %', v_event, v_endpoint.url, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Satu putaran retry. Mengembalikan jumlah kiriman ulang yang berhasil diantre ke pg_net.
CREATE OR REPLACE FUNCTION public.webhook_retry_pending()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_attempts CONSTANT INT := 5;
  c_no_answer CONSTANT INTERVAL := interval '10 minutes';
  d RECORD;
  v_code INT;
  v_timed_out BOOLEAN;
  v_net_error TEXT;
  v_rows INT;
  v_error TEXT;
  v_request_id BIGINT;
  v_resent INT := 0;
BEGIN
  -- 1. Baca jawaban kiriman yang sudah diantre ke pg_net
  FOR d IN
    SELECT * FROM public.webhook_deliveries
    WHERE status = 'pending' AND request_id IS NOT NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    v_rows := 0;
    IF to_regclass('net._http_response') IS NOT NULL THEN
      EXECUTE 'SELECT status_code, timed_out, error_msg FROM net._http_response WHERE id = $1'
        INTO v_code, v_timed_out, v_net_error
        USING d.request_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    END IF;

    IF v_rows = 0 THEN
      CONTINUE WHEN d.sent_at > now() - c_no_answer; -- masih di antrean pg_net
      v_error := 'Tidak ada jawaban dari pg_net';
    ELSIF v_code BETWEEN 200 AND 299 AND NOT coalesce(v_timed_out, FALSE) AND v_net_error IS NULL THEN
      UPDATE public.webhook_deliveries SET status = 'delivered', delivered_at = now(), last_error = NULL WHERE id = d.id;
      CONTINUE;
    ELSE
      v_error := coalesce(v_net_error, CASE WHEN v_timed_out THEN 'Timeout' END, 'HTTP ' || v_code);
    END IF;

    UPDATE public.webhook_deliveries
    SET request_id = NULL,
        last_error = v_error,
        status = CASE WHEN attempts >= c_max_attempts THEN 'failed' ELSE 'pending' END,
        next_retry_at = CASE WHEN attempts >= c_max_attempts THEN NULL
                             ELSE now() + interval '1 minute' * power(4, attempts - 1) END
    WHERE id = d.id;
  END LOOP;

  -- 2. Kirim ulang yang sudah jatuh tempo
  FOR d IN
    SELECT w.*, e.url, e.secret, e.active
    FROM public.webhook_deliveries w
    JOIN public.webhook_endpoints e ON e.id = w.endpoint_id
    WHERE w.status = 'pending' AND w.request_id IS NULL AND w.body IS NOT NULL AND w.next_retry_at <= now()
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    IF NOT d.active THEN
      UPDATE public.webhook_deliveries SET status = 'failed', next_retry_at = NULL, last_error = 'Endpoint dinonaktifkan' WHERE id = d.id;
      CONTINUE;
    END IF;
    BEGIN
      v_request_id := public.webhook_post(d.url, d.body, public.webhook_headers(d.event, d.body, d.secret));
      UPDATE public.webhook_deliveries
      SET request_id = v_request_id, attempts = attempts + 1, sent_at = now(), next_retry_at = NULL
      WHERE id = d.id;
      v_resent := v_resent + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.webhook_deliveries
      SET attempts = attempts + 1,
          last_error = SQLERRM,
          status = CASE WHEN attempts + 1 >= c_max_attempts THEN 'failed' ELSE 'pending' END,
          next_retry_at = CASE WHEN attempts + 1 >= c_max_attempts THEN NULL
                               ELSE now() + interval '1 minute' * power(4, attempts) END
      WHERE id = d.id;
    END;
  END LOOP;

  RETURN v_resent;
END;
$$;

-- Hak akses: hanya service role (dan pg_cron yang jalan sebagai postgres)
DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.webhook_headers(text,jsonb,text)',
    'public.webhook_post(text,jsonb,jsonb)',
    'public.webhook_retry_pending()'
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

-- Jadwal tiap menit lewat pg_cron. Tanpa pg_cron migration tetap jalan, retry tinggal dipanggil manual.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron tidak tersedia (%), jadwalkan webhook_retry_pending() sendiri', SQLERRM;
  END;
  IF to_regnamespace('cron') IS NOT NULL THEN
    EXECUTE $q$SELECT cron.schedule('gchub-webhook-retry', '* * * * *', 'SELECT public.webhook_retry_pending()')$q$;
  END IF;
END;
$$;
