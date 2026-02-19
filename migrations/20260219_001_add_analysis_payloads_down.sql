BEGIN;

-- SQLite does not support DROP COLUMN before 3.35; for PostgreSQL:
-- ALTER TABLE analyses DROP COLUMN IF EXISTS input_payload;
-- ALTER TABLE analyses DROP COLUMN IF EXISTS result_payload;

COMMIT;
