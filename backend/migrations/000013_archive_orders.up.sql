ALTER TABLE orders
  ADD COLUMN is_archived  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN archived_at  TIMESTAMPTZ,
  ADD COLUMN archived_by  UUID        REFERENCES users(id);

CREATE INDEX idx_orders_is_archived ON orders(is_archived);
