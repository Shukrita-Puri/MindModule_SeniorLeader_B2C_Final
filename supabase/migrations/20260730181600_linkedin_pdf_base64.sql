-- Add linkedin_pdf_base64 column for PDF upload flow
-- Part C of Plan & Onboarding Audit (July 30, 2026)
ALTER TABLE onboarding_v8_responses
  ADD COLUMN IF NOT EXISTS linkedin_pdf_base64 TEXT;

COMMENT ON COLUMN onboarding_v8_responses.linkedin_pdf_base64 IS 'Base64-encoded LinkedIn PDF uploaded during onboarding (replaces URL scraping for MVP).';
