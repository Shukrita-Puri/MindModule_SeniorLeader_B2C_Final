ALTER TABLE public.content_relevance_feedback
  DROP CONSTRAINT IF EXISTS content_relevance_feedback_content_type_check;

ALTER TABLE public.content_relevance_feedback
  ADD CONSTRAINT content_relevance_feedback_content_type_check
  CHECK (content_type IN ('soundbath','guided-practice','micro-practice','brief','plan-tod','plan-jit'));