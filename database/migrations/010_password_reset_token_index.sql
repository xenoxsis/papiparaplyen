-- Migration 010: index on password_reset_tokens.expires_at
-- Speeds up the GDPR retention cleanup job and token validation queries.
-- Idempotent — safe to re-run

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.password_reset_tokens')
    AND name = 'IX_password_reset_tokens_expires_at'
)
BEGIN
  CREATE INDEX IX_password_reset_tokens_expires_at
    ON dbo.password_reset_tokens (expires_at)
    INCLUDE (used, member_id);
  PRINT 'Created IX_password_reset_tokens_expires_at.';
END
ELSE
BEGIN
  PRINT 'IX_password_reset_tokens_expires_at already exists — skipping.';
END
GO

PRINT 'Migration 010 complete.';
GO
