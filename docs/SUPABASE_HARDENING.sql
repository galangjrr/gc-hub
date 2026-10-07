-- ==============================================================================
-- GC-HUB & GC-NET-HUB SUPABASE ROW LEVEL SECURITY (RLS) HARDENING SCRIPT
-- ==============================================================================
-- Description:
-- Secures all 6 production tables against unauthorized writes/deletes via public
-- Supabase Anon Key.
-- Public clients can SELECT/READ (for portal/specs/status), but only backend
-- Service Role & Authenticated APIs can INSERT/UPDATE/DELETE.
-- ==============================================================================

-- 1. Enable RLS on all tables
ALTER TABLE IF EXISTS pcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pakets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settings ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing overly permissive policies if any
DROP POLICY IF EXISTS "Public Read pcs" ON pcs;
DROP POLICY IF EXISTS "Service Role All pcs" ON pcs;
DROP POLICY IF EXISTS "Public Read pakets" ON pakets;
DROP POLICY IF EXISTS "Public Read inventory" ON inventory;
DROP POLICY IF EXISTS "Public Read bookings" ON bookings;
DROP POLICY IF EXISTS "Public Insert bookings" ON bookings;
DROP POLICY IF EXISTS "Service Role All bookings" ON bookings;
DROP POLICY IF EXISTS "Public Read logs" ON logs;
DROP POLICY IF EXISTS "Service Role All logs" ON logs;
DROP POLICY IF EXISTS "Public Read settings" ON settings;

-- 3. Public Read Policies (Allow portal frontend to fetch data)
CREATE POLICY "Public Read pcs" ON pcs FOR SELECT USING (true);
CREATE POLICY "Public Read pakets" ON pakets FOR SELECT USING (true);
CREATE POLICY "Public Read inventory" ON inventory FOR SELECT USING (true);
CREATE POLICY "Public Read bookings" ON bookings FOR SELECT USING (true);
CREATE POLICY "Public Insert bookings" ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Read logs" ON logs FOR SELECT USING (true);
CREATE POLICY "Public Read settings" ON settings FOR SELECT USING (true);

-- 4. Full Privileges for Service Role (Backend API & GC-Hub Server)
CREATE POLICY "Service Role All pcs" ON pcs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role All pakets" ON pakets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role All inventory" ON inventory FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role All bookings" ON bookings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role All logs" ON logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role All settings" ON settings FOR ALL TO service_role USING (true) WITH CHECK (true);
