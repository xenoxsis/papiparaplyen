-- Migration 017: add ical_token to dbo.users for personal calendar feed auth
-- Idempotent — safe to re-run

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'ical_token'
)
BEGIN
  ALTER TABLE dbo.users ADD ical_token NVARCHAR(64) NULL;
  PRINT 'Added ical_token column to dbo.users.';
END
ELSE
BEGIN
  PRINT 'ical_token already exists — skipping.';
END
GO

-- Unique index so token lookups are O(1) and tokens cannot collide
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'UX_users_ical_token'
)
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UX_users_ical_token
    ON dbo.users (ical_token)
    WHERE ical_token IS NOT NULL;
  PRINT 'Created unique index UX_users_ical_token.';
END
ELSE
BEGIN
  PRINT 'Index UX_users_ical_token already exists — skipping.';
END
GO
