-- Create meta_skill_progress table to track progress on Self Mastery and Social Mastery meta-skills
CREATE TABLE public.meta_skill_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  meta_skill_key TEXT NOT NULL,
  cluster TEXT NOT NULL, -- 'self_mastery' or 'social_mastery'
  baseline_score NUMERIC,
  current_score NUMERIC DEFAULT 0,
  scenarios_practiced INTEGER DEFAULT 0,
  strengths_demonstrated INTEGER DEFAULT 0,
  gaps_identified INTEGER DEFAULT 0,
  last_session_id UUID REFERENCES public.dialogue_sessions(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, meta_skill_key)
);

-- Enable Row Level Security
ALTER TABLE public.meta_skill_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own meta skill progress"
ON public.meta_skill_progress
FOR SELECT
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own meta skill progress"
ON public.meta_skill_progress
FOR INSERT
WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own meta skill progress"
ON public.meta_skill_progress
FOR UPDATE
USING ((auth.uid())::text = user_id);

-- Create trigger for updating updated_at
CREATE TRIGGER update_meta_skill_progress_updated_at
BEFORE UPDATE ON public.meta_skill_progress
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();