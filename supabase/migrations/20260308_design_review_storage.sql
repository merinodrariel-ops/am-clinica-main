-- Add storage_html_url to patient_design_reviews
-- Allows direct upload to Supabase Storage as alternative to Google Drive sync
ALTER TABLE public.patient_design_reviews
  ADD COLUMN IF NOT EXISTS storage_html_url TEXT NULL;

-- Create design-files storage bucket (private, 50MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'design-files',
  'design-files',
  false,
  52428800,
  ARRAY['text/html', 'model/stl', 'application/octet-stream', 'application/zip']
)
ON CONFLICT (id) DO NOTHING;
