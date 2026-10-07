-- Migration: Add reason column to logs table
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS reason TEXT;
