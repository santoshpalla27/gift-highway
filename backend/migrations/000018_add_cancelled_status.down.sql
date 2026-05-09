UPDATE orders SET status = 'yet_to_start' WHERE status = 'cancelled';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('yet_to_start','working','waiting_for_client','making','done','delivered'));
