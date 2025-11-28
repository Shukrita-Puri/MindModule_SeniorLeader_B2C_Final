-- Create sanctuary_content table
CREATE TABLE public.sanctuary_content (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('soundbath', 'guided-practice', 'micro-practice')),
  category TEXT NOT NULL CHECK (category IN ('pause', 'power-up', 'presence')),
  duration NUMERIC NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  creator TEXT,
  origin TEXT,
  story_hook TEXT,
  used_by TEXT,
  sub_type TEXT CHECK (sub_type IN ('mindset', 'tool')),
  voice TEXT CHECK (voice IN ('male', 'female', 'neutral', 'none', 'ai')),
  language TEXT DEFAULT 'en',
  thumbnail_url TEXT,
  audio_url TEXT,
  steps_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create sanctuary_content_metadata table for rich metadata
CREATE TABLE public.sanctuary_content_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id TEXT NOT NULL REFERENCES public.sanctuary_content(id) ON DELETE CASCADE,
  structured_tags JSONB DEFAULT '{}',
  full_story TEXT,
  technique TEXT,
  benefits TEXT[] DEFAULT '{}',
  completion_quote TEXT,
  intro_summary TEXT,
  what_you_need TEXT[] DEFAULT '{}',
  expected_outcomes TEXT[] DEFAULT '{}',
  essence TEXT,
  parallel TEXT,
  cue TEXT,
  real_examples JSONB DEFAULT '[]',
  why_this_works TEXT,
  delivery_modality TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(content_id)
);

-- Create sanctuary_content_steps table for practice steps
CREATE TABLE public.sanctuary_content_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id TEXT NOT NULL REFERENCES public.sanctuary_content(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  duration INTEGER,
  breathing_pattern TEXT,
  wisdom_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(content_id, step_order)
);

-- Enable RLS
ALTER TABLE public.sanctuary_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctuary_content_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctuary_content_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Public read access to active content
CREATE POLICY "Anyone can view active content"
ON public.sanctuary_content FOR SELECT
USING (is_active = true);

CREATE POLICY "Anyone can view content metadata"
ON public.sanctuary_content_metadata FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sanctuary_content 
    WHERE id = content_id AND is_active = true
  )
);

CREATE POLICY "Anyone can view content steps"
ON public.sanctuary_content_steps FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sanctuary_content 
    WHERE id = content_id AND is_active = true
  )
);

-- Admin-only write policies
CREATE POLICY "Only admins can modify content"
ON public.sanctuary_content FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can modify metadata"
ON public.sanctuary_content_metadata FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can modify steps"
ON public.sanctuary_content_steps FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create storage bucket for content assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-assets', 'content-assets', true);

-- Storage policies for public read access
CREATE POLICY "Public can view content assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'content-assets');

-- Admin-only upload policy
CREATE POLICY "Admins can upload content assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'content-assets' AND has_role(auth.uid(), 'admin'));

-- Create indexes for better query performance
CREATE INDEX idx_sanctuary_content_category ON public.sanctuary_content(category);
CREATE INDEX idx_sanctuary_content_type ON public.sanctuary_content(content_type);
CREATE INDEX idx_sanctuary_content_active ON public.sanctuary_content(is_active);
CREATE INDEX idx_sanctuary_content_steps_content_id ON public.sanctuary_content_steps(content_id);

-- Create trigger for updated_at
CREATE TRIGGER update_sanctuary_content_updated_at
BEFORE UPDATE ON public.sanctuary_content
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sanctuary_content_metadata_updated_at
BEFORE UPDATE ON public.sanctuary_content_metadata
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();