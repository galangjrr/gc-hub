-- =====================================================================================
-- GC Hub 010: kunci fungsi trigger SECURITY DEFINER dari RPC publik
-- Temuan security advisor Supabase 2026-10-08. Fungsi trigger tidak perlu bisa dipanggil lewat
-- /rest/v1/rpc: Postgres hanya mengecek EXECUTE saat trigger dibuat, jadi trigger tetap jalan
-- untuk semua role setelah EXECUTE dicabut. handle_new_user (signup member, dari GC Net Booking)
-- juga dikunci search_path-nya; isinya sudah memakai nama tabel lengkap public.members.
-- Aman dijalankan ulang, dan melewati fungsi yang tidak ada.
-- =====================================================================================

DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.bookings_webhook_dispatch()',
    'public.handle_new_user()',
    'public.rls_auto_enable()'
  ] LOOP
    CONTINUE WHEN to_regprocedure(v_fn) IS NULL;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', v_fn);
    END IF;
  END LOOP;

  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = '';
  END IF;
END;
$$;
