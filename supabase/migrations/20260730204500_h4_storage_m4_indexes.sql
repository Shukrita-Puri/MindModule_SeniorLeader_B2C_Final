-- ============================================================================
-- Migration: H-4 Storage Policies, M-4 Composite Index, H-3 User Roles Sync
-- Date: 2026-07-30
-- ============================================================================

-- ── 1. M-4: Composite Index for notification_log query performance ─────────
-- Optimizes queries filtering by user_id and range-querying sent_at.
CREATE INDEX IF NOT EXISTS idx_notification_log_user_sent
  ON public.notification_log (user_id, sent_at DESC);

-- ── 2. H-4: Fix Storage Admin Policies for Auth0 JWTs ────────────────────────
-- Storage admin policies used auth.uid() (UUID) which returns NULL for Auth0 text subs.
-- Replace with auth.jwt() ->> 'sub'.

DROP POLICY IF EXISTS "Admin users can upload content assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can update content assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can delete content assets" ON storage.objects;

CREATE POLICY "Admin users can upload content assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'content-assets' AND (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (auth.jwt() ->> 'sub')
          AND ur.role = 'admin'
      ) OR (auth.jwt() ->> 'email') IN ('shukrita@mindmodule.me', 'itsmanojkdev@gmail.com')
    )
  );

CREATE POLICY "Admin users can update content assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'content-assets' AND (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (auth.jwt() ->> 'sub')
          AND ur.role = 'admin'
      ) OR (auth.jwt() ->> 'email') IN ('shukrita@mindmodule.me', 'itsmanojkdev@gmail.com')
    )
  );

CREATE POLICY "Admin users can delete content assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'content-assets' AND (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (auth.jwt() ->> 'sub')
          AND ur.role = 'admin'
      ) OR (auth.jwt() ->> 'email') IN ('shukrita@mindmodule.me', 'itsmanojkdev@gmail.com')
    )
  );

-- ── 3. H-3: Seed user_roles for allowlisted admin emails ─────────────────────
-- Automatically populate user_roles for any user whose profile email is in the admin allowlist.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM public.profiles
WHERE LOWER(email) IN ('shukrita@mindmodule.me', 'itsmanojkdev@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;
