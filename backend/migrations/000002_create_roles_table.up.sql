CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (name, description, permissions) VALUES
    ('admin', 'Full system access', '{"all": true}'),
    ('manager', 'Team management access', '{"users": ["read", "write"], "orders": ["read", "write", "delete"]}'),
    ('member', 'Standard access', '{"orders": ["read", "write"]}')
ON CONFLICT DO NOTHING;
