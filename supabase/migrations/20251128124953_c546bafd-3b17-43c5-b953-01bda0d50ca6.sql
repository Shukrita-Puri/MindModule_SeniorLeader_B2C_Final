-- Add protocol_type column to sanctuary_content
ALTER TABLE sanctuary_content 
ADD COLUMN IF NOT EXISTS protocol_type TEXT 
CHECK (protocol_type IN ('mindset', 'somatic', 'audio', 'hybrid'));

-- Ensure content-assets bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-assets',
  'content-assets',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'audio/mpeg', 'audio/wav', 'audio/mp3']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'audio/mpeg', 'audio/wav', 'audio/mp3'];

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public can view content assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload content assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update content assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete content assets" ON storage.objects;

-- RLS policies for content-assets bucket
CREATE POLICY "Public can view content assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'content-assets');

CREATE POLICY "Admins can upload content assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'content-assets' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update content assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'content-assets' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete content assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'content-assets' AND has_role(auth.uid(), 'admin'));