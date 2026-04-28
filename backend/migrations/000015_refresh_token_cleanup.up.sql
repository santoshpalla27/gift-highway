-- Hard-delete all tokens that are already revoked or expired — they serve no purpose.
-- Rotation sets revoked_at immediately, so these are 100% dead rows.
DELETE FROM refresh_tokens
WHERE revoked_at IS NOT NULL
   OR expires_at < NOW();

-- Index to make future expiry-based cleanup fast.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
