-- ─── Release pipeline status ──────────────────────────────────────────────────
ALTER TABLE releases ADD COLUMN IF NOT EXISTS pipeline_status text DEFAULT 'in_progress';

-- ─── Ledger (royalty / advance tracker) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id    uuid REFERENCES artists(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('advance','royalty','payment','expense')),
  amount       numeric(12,2) NOT NULL,
  description  text,
  date         date NOT NULL DEFAULT CURRENT_DATE,
  release_id   uuid REFERENCES releases(id),
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/team read ledger"  ON ledger FOR SELECT USING (get_my_role() IN ('owner','team'));
CREATE POLICY "Owner/team write ledger" ON ledger FOR ALL    USING (get_my_role() IN ('owner','team'));
CREATE POLICY "Artist read own ledger"  ON ledger FOR SELECT USING (
  artist_id IN (SELECT id FROM artists WHERE profile_id = auth.uid())
);

-- ─── A&R demos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anr_demos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_name  text NOT NULL,
  title        text,
  genre        text,
  status       text DEFAULT 'received' CHECK (status IN ('received','reviewing','in_talks','signed','passed')),
  rating       int  CHECK (rating BETWEEN 1 AND 5),
  notes        text,
  audio_url    text,
  submitted_by text,
  submitted_at date DEFAULT CURRENT_DATE,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE anr_demos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/team manage demos" ON anr_demos FOR ALL USING (get_my_role() IN ('owner','team'));

-- ─── Pitches ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pitches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id   uuid REFERENCES releases(id) ON DELETE CASCADE,
  platform     text NOT NULL,
  target       text,
  status       text DEFAULT 'pitched' CHECK (status IN ('pitched','accepted','declined','pending')),
  pitched_at   date DEFAULT CURRENT_DATE,
  result_at    date,
  notes        text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE pitches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/team manage pitches" ON pitches FOR ALL USING (get_my_role() IN ('owner','team'));
CREATE POLICY "Artist read pitches for their releases" ON pitches FOR SELECT USING (
  release_id IN (
    SELECT r.id FROM releases r
    JOIN release_artists ra ON ra.release_id = r.id
    JOIN artists a ON a.id = ra.artist_id
    WHERE a.profile_id = auth.uid()
  )
);
