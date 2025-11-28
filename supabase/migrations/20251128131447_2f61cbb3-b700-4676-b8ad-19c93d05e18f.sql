-- Fix type mismatch in RLS policies that join sanctuary_content to metadata and steps

-- Update policy for sanctuary_content_metadata
ALTER POLICY "Anyone can view content metadata"
ON public.sanctuary_content_metadata
USING (
  EXISTS (
    SELECT 1
    FROM public.sanctuary_content
    WHERE sanctuary_content.id::text = sanctuary_content_metadata.content_id::text
      AND sanctuary_content.is_active = true
  )
);

-- Update policy for sanctuary_content_steps
ALTER POLICY "Anyone can view content steps"
ON public.sanctuary_content_steps
USING (
  EXISTS (
    SELECT 1
    FROM public.sanctuary_content
    WHERE sanctuary_content.id::text = sanctuary_content_steps.content_id::text
      AND sanctuary_content.is_active = true
  )
);
