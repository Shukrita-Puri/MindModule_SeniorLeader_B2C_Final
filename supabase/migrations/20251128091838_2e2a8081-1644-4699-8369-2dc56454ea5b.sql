-- Create content-assets storage bucket for images and audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-assets', 'content-assets', true)
ON CONFLICT (id) DO NOTHING;