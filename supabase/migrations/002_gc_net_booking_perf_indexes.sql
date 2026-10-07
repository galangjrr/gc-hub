-- GC Net Booking Index Optimizations
CREATE INDEX IF NOT EXISTS idx_bookings_status_created ON public.bookings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_pc_id ON public.bookings (pc_id);
CREATE INDEX IF NOT EXISTS idx_pcs_status ON public.pcs (status);
CREATE INDEX IF NOT EXISTS idx_pakets_price ON public.pakets (price ASC);
CREATE INDEX IF NOT EXISTS idx_logs_end_time ON public.logs (end_time DESC);
CREATE INDEX IF NOT EXISTS idx_logs_status ON public.logs (status);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory (category);
