-- ============================================================
--  Migration 00004 — Personnel & Lot Profile Master Tables
--  Excursion Hit Analytics
--  Idempotent: safe to re-run.
-- ============================================================

-- ─── 1. Personnel Profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personnel_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    TEXT NOT NULL,
  name_key        TEXT NOT NULL UNIQUE,
  personnel_type  TEXT NOT NULL DEFAULT 'Filling',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_name_key    ON personnel_profiles(name_key);
CREATE INDEX IF NOT EXISTS idx_pp_ptype       ON personnel_profiles(personnel_type);

-- ─── 2. Lot Profiles ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lot_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_lot     TEXT NOT NULL,
  lot_key         TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lp_lot_key ON lot_profiles(lot_key);

-- ─── 3. Add FK columns to records ──────────────────────────────────────────
ALTER TABLE records ADD COLUMN IF NOT EXISTS personnel_id UUID REFERENCES personnel_profiles(id);
ALTER TABLE records ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES lot_profiles(id);

CREATE INDEX IF NOT EXISTS idx_records_personnel_id ON records(personnel_id);
CREATE INDEX IF NOT EXISTS idx_records_lot_id ON records(lot_id);

-- ─── 4. Backfill personnel profiles from existing records ──────────────────
-- Creates one profile per unique name_key. Uses MIN(name) for display_name
-- and the most frequently used personnel_type.
INSERT INTO personnel_profiles (display_name, name_key, personnel_type)
SELECT
  MIN(name) AS display_name,
  COALESCE(name_key, LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')))) AS nk,
  (
    SELECT personnel_type FROM records r2
    WHERE COALESCE(r2.name_key, LOWER(TRIM(REGEXP_REPLACE(r2.name, '\s+', ' ', 'g')))) = COALESCE(r.name_key, LOWER(TRIM(REGEXP_REPLACE(r.name, '\s+', ' ', 'g'))))
    GROUP BY personnel_type
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ) AS personnel_type
FROM records r
GROUP BY COALESCE(name_key, LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g'))))
ON CONFLICT (name_key) DO NOTHING;

-- ─── 5. Backfill lot profiles from existing records ────────────────────────
INSERT INTO lot_profiles (display_lot, lot_key)
SELECT
  MIN(lot_number) AS display_lot,
  COALESCE(lot_number_key, LOWER(TRIM(REGEXP_REPLACE(lot_number, '\s+', ' ', 'g')))) AS lk
FROM records
GROUP BY COALESCE(lot_number_key, LOWER(TRIM(REGEXP_REPLACE(lot_number, '\s+', ' ', 'g'))))
ON CONFLICT (lot_key) DO NOTHING;

-- Also backfill from viable_data
INSERT INTO lot_profiles (display_lot, lot_key)
SELECT
  MIN(lot_number),
  COALESCE(lot_number_key, LOWER(TRIM(REGEXP_REPLACE(lot_number, '\s+', ' ', 'g'))))
FROM viable_data
GROUP BY COALESCE(lot_number_key, LOWER(TRIM(REGEXP_REPLACE(lot_number, '\s+', ' ', 'g'))))
ON CONFLICT (lot_key) DO NOTHING;

-- ─── 6. Assign profile IDs to existing records ────────────────────────────
UPDATE records r SET personnel_id = pp.id
FROM personnel_profiles pp
WHERE pp.name_key = COALESCE(r.name_key, LOWER(TRIM(REGEXP_REPLACE(r.name, '\s+', ' ', 'g'))))
  AND r.personnel_id IS NULL;

UPDATE records r SET lot_id = lp.id
FROM lot_profiles lp
WHERE lp.lot_key = COALESCE(r.lot_number_key, LOWER(TRIM(REGEXP_REPLACE(r.lot_number, '\s+', ' ', 'g'))))
  AND r.lot_id IS NULL;

-- ─── 7. Add hit_date index for records ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_records_hit_date ON records(hit_date);
