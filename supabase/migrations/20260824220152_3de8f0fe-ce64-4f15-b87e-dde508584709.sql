CREATE TABLE IF NOT EXISTS public.catalog_load_staging (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

GRANT ALL ON public.catalog_load_staging TO service_role;
GRANT SELECT, INSERT ON public.catalog_load_staging TO sandbox_exec;

ALTER TABLE public.catalog_load_staging ENABLE ROW LEVEL SECURITY;