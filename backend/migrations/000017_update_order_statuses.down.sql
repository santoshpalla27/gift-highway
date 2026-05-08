-- Revert new statuses back to old values
UPDATE orders SET status = 'in_progress' WHERE status = 'working';
UPDATE orders SET status = 'new'         WHERE status = 'yet_to_start';
UPDATE orders SET status = 'completed'   WHERE status IN ('done','delivered','waiting_for_client','making');

-- Restore old constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('new','in_progress','completed'));
