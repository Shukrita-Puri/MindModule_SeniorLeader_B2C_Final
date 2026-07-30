CREATE INDEX IF NOT EXISTS idx_notification_log_user_sent
  ON public.notification_log (user_id, sent_at DESC);

DROP POLICY IF EXISTS "Admins can upload content assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update content assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete content assets" ON storage.objects;
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

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM public.profiles
WHERE LOWER(email) IN ('shukrita@mindmodule.me', 'itsmanojkdev@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;