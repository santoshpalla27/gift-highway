DROP TRIGGER IF EXISTS trg_auto_order_title ON orders;
DROP FUNCTION IF EXISTS set_order_title();
ALTER TABLE orders DROP COLUMN IF EXISTS order_description;
