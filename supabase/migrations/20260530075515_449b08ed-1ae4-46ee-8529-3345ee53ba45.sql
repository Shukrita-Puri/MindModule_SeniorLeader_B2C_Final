CREATE TABLE public.user_external_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  source text NOT NULL,
  profile_url text NOT NULL,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  scrape_status text NOT NULL DEFAULT 'pending',
  scrape_error text,
  scraped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, profile_url)
);

CREATE INDEX idx_user_external_profiles_user_source
  ON public.user_external_profiles (user_id, source);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_external_profiles TO authenticated;
GRANT ALL ON public.user_external_profiles TO service_role;

ALTER TABLE public.user_external_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own external profiles"
  ON public.user_external_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert their own external profiles"
  ON public.user_external_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update their own external profiles"
  ON public.user_external_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can delete their own external profiles"
  ON public.user_external_profiles
  FOR DELETE
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE TRIGGER set_user_external_profiles_updated_at
  BEFORE UPDATE ON public.user_external_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();