CREATE TABLE customer_portals (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    token         TEXT        UNIQUE NOT NULL,
    customer_name TEXT        NOT NULL DEFAULT '',
    enabled       BOOLEAN     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_customer_portals_order_id ON customer_portals(order_id);
CREATE INDEX        idx_customer_portals_token    ON customer_portals(token);

CREATE TABLE portal_messages (
    id            BIGSERIAL   PRIMARY KEY,
    order_id      UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    message       TEXT        NOT NULL DEFAULT '',
    portal_sender TEXT        NOT NULL DEFAULT '',
    sender_type   TEXT        NOT NULL DEFAULT 'customer',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portal_messages_order_id ON portal_messages(order_id);

CREATE TABLE portal_attachments (
    id         BIGSERIAL   PRIMARY KEY,
    order_id   UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    s3_key     TEXT        NOT NULL DEFAULT '',
    file_name  TEXT        NOT NULL DEFAULT '',
    file_type  TEXT        NOT NULL DEFAULT '',
    file_size  BIGINT      NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portal_attachments_order_id ON portal_attachments(order_id);
