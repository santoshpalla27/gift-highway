-- Rename any existing duplicate titles (keep the oldest, append order_number to newer ones)
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY LOWER(title) ORDER BY order_number ASC) AS rn,
           order_number
    FROM orders
)
UPDATE orders
SET title = orders.title || '-' || duplicates.order_number::text
FROM duplicates
WHERE orders.id = duplicates.id
  AND duplicates.rn > 1;

-- Now safe to add the unique index
CREATE UNIQUE INDEX orders_title_unique ON orders (LOWER(title));
