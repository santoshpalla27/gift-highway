-- 1. Add the new order_description column (short user-typed label for the order)
ALTER TABLE orders ADD COLUMN order_description TEXT NOT NULL DEFAULT '';

-- 2. Create a trigger function that auto-sets title = 'Order #N' on every INSERT.
--    This replaces the manual user-typed title for new orders.
CREATE OR REPLACE FUNCTION set_order_title()
RETURNS TRIGGER AS $$
BEGIN
  NEW.title := 'Order #' || NEW.order_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach the trigger so it fires BEFORE each INSERT on the orders table.
CREATE TRIGGER trg_auto_order_title
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION set_order_title();
