ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('new', 'in_progress', 'waiting', 'completed', 'cancelled'));
ALTER TABLE orders DROP COLUMN IF EXISTS contact_number;
