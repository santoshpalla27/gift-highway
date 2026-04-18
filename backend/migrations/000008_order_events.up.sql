CREATE TABLE order_events (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    type       TEXT        NOT NULL,
    actor_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
    payload    JSONB       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_events_order_id   ON order_events(order_id);
CREATE INDEX idx_order_events_created_at ON order_events(created_at);
