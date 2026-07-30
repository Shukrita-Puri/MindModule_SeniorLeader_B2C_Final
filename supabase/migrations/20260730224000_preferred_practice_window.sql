-- ============================================================================
-- Migration: Add preferred_practice_window to profiles (F6)
-- Date: 2026-07-30
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_practice_window TEXT
  CHECK (preferred_practice_window IN ('morning', 'evening', 'system_decide'))
  DEFAULT 'system_decide';
