-- Migration: add email notification preferences to dbo.users
-- Idempotent — safe to re-run

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'email_on_mention'
)
BEGIN
  ALTER TABLE dbo.users
    ADD email_on_mention BIT NOT NULL DEFAULT 1,
        email_on_nights   BIT NOT NULL DEFAULT 1,
        email_on_shift    BIT NOT NULL DEFAULT 1;
  PRINT 'Added email preference columns to dbo.users.';
END
ELSE
BEGIN
  PRINT 'Email preference columns already exist — skipping.';
END
GO
