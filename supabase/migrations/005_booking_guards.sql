-- ==============================================================================
-- 005 BOOKING GUARDS: jaminan level database, bukan cuma di API
-- ==============================================================================
-- Berlaku juga untuk insert langsung dari web GC Net Hub (anon key), jadi double
-- booking tidak mungkin terjadi walau ada dua request bersamaan.
-- Dipisah dari 004 karena bisa gagal jika data lama sudah punya duplikat.
-- ==============================================================================

DO $$
DECLARE
  v_dup_pending INT;
  v_dup_active INT;
BEGIN
  SELECT count(*) INTO v_dup_pending FROM (
    SELECT pc_id FROM public.bookings
    WHERE status = 'pending' AND booking_type = 'queue' AND pc_id IS NOT NULL
    GROUP BY pc_id HAVING count(*) > 1
  ) d;
  SELECT count(*) INTO v_dup_active FROM (
    SELECT pc_id FROM public.bookings
    WHERE status = 'active' AND pc_id IS NOT NULL
    GROUP BY pc_id HAVING count(*) > 1
  ) d;

  IF v_dup_pending > 0 OR v_dup_active > 0 THEN
    RAISE EXCEPTION 'Ada % PC dengan >1 antrean pending dan % PC dengan >1 booking active. Rapikan dulu, contoh: %',
      v_dup_pending, v_dup_active,
      'SELECT pc_id, status, count(*) FROM bookings WHERE status IN (''pending'',''active'') GROUP BY 1,2 HAVING count(*) > 1;';
  END IF;
END;
$$;

-- Satu antrean pending per PC (mode antre PC terpakai)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_one_pending_queue_per_pc
  ON public.bookings (pc_id) WHERE status = 'pending' AND booking_type = 'queue' AND pc_id IS NOT NULL;

-- Satu booking aktif per PC (sesi sedang berjalan)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_one_active_per_pc
  ON public.bookings (pc_id) WHERE status = 'active' AND pc_id IS NOT NULL;
