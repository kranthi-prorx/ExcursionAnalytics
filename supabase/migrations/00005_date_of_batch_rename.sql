-- ============================================================
--  Migration 00005 — Rename hit_date to date_of_batch
--  Excursion Hit Analytics
--  Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  -- Rename the column in records table if it hasn't been renamed yet
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'records' AND column_name = 'hit_date'
  ) THEN
    ALTER TABLE records RENAME COLUMN hit_date TO date_of_batch;
  END IF;

  -- Rename the index
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_records_hit_date'
  ) THEN
    ALTER INDEX idx_records_hit_date RENAME TO idx_records_date_of_batch;
  END IF;
END $$;
