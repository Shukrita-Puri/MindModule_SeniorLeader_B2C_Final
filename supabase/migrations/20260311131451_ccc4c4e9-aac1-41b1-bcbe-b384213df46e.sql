
CREATE TABLE public.beta_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  beta_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'activated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  invited_by text
);

ALTER TABLE public.beta_invites ENABLE ROW LEVEL SECURITY;

-- Deny all client-side access; only edge functions with service role can access
CREATE POLICY "Deny all direct access" ON public.beta_invites
  FOR ALL TO anon, authenticated USING (false);
