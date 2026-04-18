CREATE TABLE order_attachments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_id    UUID        REFERENCES order_events(id) ON DELETE SET NULL,
    uploaded_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    file_name   TEXT        NOT NULL,
    file_key    TEXT        NOT NULL,
    file_url    TEXT        NOT NULL,
    mime_type   TEXT        NOT NULL,
    size_bytes  BIGINT      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_attachments_order_id   ON order_attachments(order_id);
CREATE INDEX idx_order_attachments_created_at ON order_attachments(created_at);
