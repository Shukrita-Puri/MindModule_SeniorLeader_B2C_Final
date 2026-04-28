DELETE FROM public.brief_snapshots
WHERE local_date = '2026-04-28'
  AND brief_source = 'llm'
  AND (body_text ~ '[—–]' OR body_text ILIKE '%hardware%' OR body_text ILIKE '%biometric%' OR phrase ~ '[—–]');