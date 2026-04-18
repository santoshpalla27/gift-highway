CREATE TABLE order_assignees (
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id  UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    PRIMARY KEY (order_id, user_id)
);

-- migrate existing single-assignee data
INSERT INTO order_assignees (order_id, user_id)
SELECT id, assigned_to FROM orders WHERE assigned_to IS NOT NULL;

ALTER TABLE orders DROP COLUMN assigned_to;
