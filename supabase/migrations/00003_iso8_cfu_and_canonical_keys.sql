-- ============================================================
--  Migration 00003 — ISO 8 CFU, Canonical Keys, Processed Batches
--  Excursion Hit Analytics
--  Idempotent: safe to re-run.
-- ============================================================

-- ─── 1. Add ISO 8 CFU column to viable_data ─────────────────────────────────
ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS iso8_cfu SMALLINT NOT NULL DEFAULT 0;

-- ─── 2. Add canonical identity columns to records ───────────────────────────
ALTER TABLE records ADD COLUMN IF NOT EXISTS name_key TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS lot_number_key TEXT;

-- Backfill canonical keys from existing data
UPDATE records
SET name_key = LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')))
WHERE name_key IS NULL;

UPDATE records
SET lot_number_key = LOWER(TRIM(REGEXP_REPLACE(lot_number, '\s+', ' ', 'g')))
WHERE lot_number_key IS NULL;

-- Indexes for canonical key lookups
CREATE INDEX IF NOT EXISTS idx_records_name_key ON records(name_key);
CREATE INDEX IF NOT EXISTS idx_records_lot_key  ON records(lot_number_key);

-- ─── 3. Add canonical lot_number_key to viable_data ─────────────────────────
ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS lot_number_key TEXT;

UPDATE viable_data
SET lot_number_key = LOWER(TRIM(REGEXP_REPLACE(lot_number, '\s+', ' ', 'g')))
WHERE lot_number_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_viable_lot_key ON viable_data(lot_number_key);

-- ─── 4. Add canonical lot_number_key to surface_sampling ────────────────────
ALTER TABLE surface_sampling ADD COLUMN IF NOT EXISTS lot_number_key TEXT;

UPDATE surface_sampling
SET lot_number_key = LOWER(TRIM(REGEXP_REPLACE(lot_number, '\s+', ' ', 'g')))
WHERE lot_number_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_surface_lot_key ON surface_sampling(lot_number_key);

-- ─── 5. Create processed_batches table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS processed_batches (
  id              SERIAL PRIMARY KEY,
  lot_number      TEXT NOT NULL,
  lot_number_key  TEXT NOT NULL,
  batch_date      DATE NOT NULL,
  room_area       TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one batch per normalized lot per date
-- Use DO block to make idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_processed_batch_lot_date'
  ) THEN
    ALTER TABLE processed_batches
      ADD CONSTRAINT uq_processed_batch_lot_date UNIQUE (lot_number_key, batch_date);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_pb_lot_key    ON processed_batches(lot_number_key);
CREATE INDEX IF NOT EXISTS idx_pb_batch_date ON processed_batches(batch_date);

-- ─── 6. Backfill processed_batches from existing records ────────────────────
-- Creates one processed batch entry per (normalized lot, hit_date) from records.
-- Does NOT fabricate batches that aren't evidenced in the data.
INSERT INTO processed_batches (lot_number, lot_number_key, batch_date)
SELECT DISTINCT ON (LOWER(TRIM(REGEXP_REPLACE(lot_number, '\s+', ' ', 'g'))), hit_date)
  lot_number,
  LOWER(TRIM(REGEXP_REPLACE(lot_number, '\s+', ' ', 'g'))),
  hit_date
FROM records
WHERE hit_date IS NOT NULL
ON CONFLICT (lot_number_key, batch_date) DO NOTHING;

-- ─── 7. Additional indexes for analytics performance ────────────────────────
CREATE INDEX IF NOT EXISTS idx_records_hit_date_lot ON records(hit_date, lot_number_key);
CREATE INDEX IF NOT EXISTS idx_hitdetails_iso_hit   ON hit_details(iso_class, hit_value);
