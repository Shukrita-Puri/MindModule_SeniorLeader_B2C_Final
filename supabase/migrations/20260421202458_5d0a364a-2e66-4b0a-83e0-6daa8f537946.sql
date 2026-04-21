-- Invalidate stale evening brief snapshot so next render regenerates with updated deterministic copy
-- ("Day 7 pattern" → "7-day energy deficit", etc.)
DELETE FROM public.brief_snapshots
WHERE id = '6b3e8606-e566-494a-92ef-1ba2612058c4';