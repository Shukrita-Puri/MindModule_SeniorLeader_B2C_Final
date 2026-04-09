
ALTER TABLE public.sanctuary_content_metadata 
ADD COLUMN IF NOT EXISTS horizon text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS meta_skill text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_foundational boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS moment text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS state_signal text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS duration_band text DEFAULT 'short';
