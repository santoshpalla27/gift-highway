ALTER TABLE orders ADD COLUMN assigned_to UUID REFERENCES users(id);

UPDATE orders o SET assigned_to = (
    SELECT user_id FROM order_assignees WHERE order_id = o.id LIMIT 1
);

DROP TABLE order_assignees;
