-- Migration 008: GDPR compliance improvements
-- Idempotent — safe to re-run

-- 1. Add email_consent_at timestamp to dbo.users
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'email_consent_at'
)
BEGIN
  ALTER TABLE dbo.users
    ADD email_consent_at DATETIME2 NULL;
  PRINT 'Added email_consent_at column to dbo.users.';
END
ELSE
BEGIN
  PRINT 'email_consent_at already exists — skipping.';
END
GO

-- 2. Change email_on_* defaults from 1 (opt-in) to 0 (opt-out) — GDPR Art. 7
--    Existing rows are unaffected; new inserts without explicit value will default to 0.
-- Drop and recreate default for email_on_mention
DECLARE @con NVARCHAR(256);
SELECT @con = dc.name
  FROM sys.default_constraints dc
  JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.users') AND c.name = 'email_on_mention';
IF @con IS NOT NULL
  EXEC('ALTER TABLE dbo.users DROP CONSTRAINT [' + @con + ']');
IF NOT EXISTS (
  SELECT 1 FROM sys.default_constraints dc
  JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.users') AND c.name = 'email_on_mention'
)
BEGIN
  ALTER TABLE dbo.users ADD CONSTRAINT DF_users_email_on_mention DEFAULT 0 FOR email_on_mention;
  PRINT 'Changed email_on_mention default to 0.';
END
GO

-- Drop and recreate default for email_on_nights
DECLARE @con NVARCHAR(256);
SELECT @con = dc.name
  FROM sys.default_constraints dc
  JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.users') AND c.name = 'email_on_nights';
IF @con IS NOT NULL
  EXEC('ALTER TABLE dbo.users DROP CONSTRAINT [' + @con + ']');
IF NOT EXISTS (
  SELECT 1 FROM sys.default_constraints dc
  JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.users') AND c.name = 'email_on_nights'
)
BEGIN
  ALTER TABLE dbo.users ADD CONSTRAINT DF_users_email_on_nights DEFAULT 0 FOR email_on_nights;
  PRINT 'Changed email_on_nights default to 0.';
END
GO

-- Drop and recreate default for email_on_shift
DECLARE @con NVARCHAR(256);
SELECT @con = dc.name
  FROM sys.default_constraints dc
  JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.users') AND c.name = 'email_on_shift';
IF @con IS NOT NULL
  EXEC('ALTER TABLE dbo.users DROP CONSTRAINT [' + @con + ']');
IF NOT EXISTS (
  SELECT 1 FROM sys.default_constraints dc
  JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.users') AND c.name = 'email_on_shift'
)
BEGIN
  ALTER TABLE dbo.users ADD CONSTRAINT DF_users_email_on_shift DEFAULT 0 FOR email_on_shift;
  PRINT 'Changed email_on_shift default to 0.';
END
GO

-- 3. Allow NULL on dbo.members.email to support erasure (right to be forgotten)
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.members') AND name = 'email' AND is_nullable = 0
)
BEGIN
  ALTER TABLE dbo.members ALTER COLUMN email NVARCHAR(255) NULL;
  PRINT 'Made dbo.members.email nullable (supports erasure).';
END
ELSE
BEGIN
  PRINT 'dbo.members.email already nullable — skipping.';
END
GO

-- 4. Allow NULL on dbo.messages.body to support true content erasure
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.messages') AND name = 'body' AND is_nullable = 0
)
BEGIN
  ALTER TABLE dbo.messages ALTER COLUMN body NVARCHAR(MAX) NULL;
  PRINT 'Made dbo.messages.body nullable (supports erasure).';
END
ELSE
BEGIN
  PRINT 'dbo.messages.body already nullable — skipping.';
END
GO

PRINT 'Migration 008 (GDPR) complete.';
GO
