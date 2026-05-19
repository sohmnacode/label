-- ─── Label profile ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS label_profile (
  id            uuid PRIMARY KEY REFERENCES profiles(id),
  label_name    text,
  label_logo_url text,
  contact_email text,
  website       text,
  instagram     text,
  twitter       text,
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE label_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages label profile" ON label_profile FOR ALL    USING (id = auth.uid());
CREATE POLICY "Anyone reads label profile"  ON label_profile FOR SELECT USING (true);

-- ─── Publishing splits ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pub_splits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid REFERENCES releases(id) ON DELETE CASCADE,
  name       text NOT NULL,
  role       text DEFAULT 'writer' CHECK (role IN ('writer','co-writer','publisher','co-publisher')),
  share_pct  numeric(5,2),
  pro        text,
  ipi        text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pub_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner/team manage pub splits" ON pub_splits FOR ALL USING (get_my_role() IN ('owner','team'));

-- ─── Sync licenses ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_licenses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid REFERENCES releases(id) ON DELETE CASCADE,
  licensee   text NOT NULL,
  usage      text CHECK (usage IN ('TV','Film','Ad','Game','Trailer','Other')),
  fee        numeric(12,2),
  territory  text,
  term_start date,
  term_end   date,
  notes      text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sync_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner/team manage sync" ON sync_licenses FOR ALL USING (get_my_role() IN ('owner','team'));

-- ─── Audio tracks column ──────────────────────────────────────────────────────
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS audio_url text;

-- ─── Audio storage bucket ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('audio', 'audio', false, 209715200,
  ARRAY['audio/mpeg','audio/wav','audio/flac','audio/aiff','audio/x-aiff','audio/ogg'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owner/team upload audio" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audio' AND get_my_role() IN ('owner','team'));
CREATE POLICY "Authenticated users read audio" ON storage.objects FOR SELECT
  USING (bucket_id = 'audio' AND auth.role() = 'authenticated');
CREATE POLICY "Owner/team delete audio" ON storage.objects FOR DELETE
  USING (bucket_id = 'audio' AND get_my_role() IN ('owner','team'));
