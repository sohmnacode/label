-- ─── Release checklist items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid REFERENCES releases(id) ON DELETE CASCADE,
  title      text NOT NULL,
  completed  bool DEFAULT false,
  completed_at timestamptz,
  due_date   date,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner/team manage checklist" ON checklist_items FOR ALL    USING (get_my_role() IN ('owner','team'));
CREATE POLICY "Anyone read checklist"       ON checklist_items FOR SELECT USING (true);

-- ─── Budget entries ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid REFERENCES releases(id) ON DELETE CASCADE,
  category   text NOT NULL CHECK (category IN ('recording','mixing','mastering','artwork','marketing','promo','distribution','other')),
  description text,
  amount     numeric(12,2) NOT NULL,
  date       date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE budget_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner/team manage budget" ON budget_entries FOR ALL USING (get_my_role() IN ('owner','team'));

-- ─── Press & radio pitches ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS press_pitches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id   uuid REFERENCES releases(id) ON DELETE CASCADE,
  outlet       text NOT NULL,
  contact      text,
  type         text DEFAULT 'blog' CHECK (type IN ('blog','radio','editorial','podcast','playlist','tv','other')),
  status       text DEFAULT 'sent' CHECK (status IN ('sent','pending','covered','declined')),
  sent_at      date DEFAULT CURRENT_DATE,
  coverage_url text,
  notes        text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE press_pitches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner/team manage press" ON press_pitches FOR ALL USING (get_my_role() IN ('owner','team'));
