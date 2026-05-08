-- Drop old constraint first so data migration is not blocked
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Migrate existing statuses to new values
UPDATE orders SET status = 'yet_to_start' WHERE status = 'new';
UPDATE orders SET status = 'working'      WHERE status = 'in_progress';
UPDATE orders SET status = 'done'         WHERE status = 'completed';

-- Add new constraint
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('yet_to_start','working','waiting_for_client','making','done','delivered'));
