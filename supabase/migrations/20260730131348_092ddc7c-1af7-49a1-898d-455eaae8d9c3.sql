ALTER TABLE public.onboarding_v8_responses
  ADD COLUMN IF NOT EXISTS linkedin_pdf_base64 TEXT;

COMMENT ON COLUMN public.onboarding_v8_responses.linkedin_pdf_base64 IS 'Base64-encoded LinkedIn PDF uploaded during onboarding (replaces URL scraping for MVP).';