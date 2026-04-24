ALTER TABLE orders
  DROP COLUMN IF EXISTS archived_by,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS is_archived;

DROP INDEX IF EXISTS idx_orders_is_archived;
