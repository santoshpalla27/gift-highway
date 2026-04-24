CREATE TABLE IF NOT EXISTS notification_reads (
    user_id      UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    order_id     UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01 00:00:00 UTC',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id
    ON notification_reads (user_id);
