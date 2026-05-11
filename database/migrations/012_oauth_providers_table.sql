-- Migration 012: introduce dbo.user_oauth_providers
-- Allows a single user account to have both a local password AND one or more
-- OAuth providers (Google, Facebook, etc.) linked simultaneously.
--
-- Changes:
--   1. Create dbo.user_oauth_providers (user_id, provider, provider_id, linked_at)
--   2. Migrate existing OAuth rows from dbo.users into the new table
--   3. Make dbo.users.password nullable (NULL = pure OAuth account, no password)
--   4. Null out empty-string passwords left by OAuth-only accounts
--   5. Drop dbo.users.provider_id
--   6. Drop dbo.users.provider
-- Idempotent — safe to re-run

-- 1. Create dbo.user_oauth_providers
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('dbo.user_oauth_providers')
)
BEGIN
  CREATE TABLE dbo.user_oauth_providers (
    id          INT           NOT NULL IDENTITY(1,1),
    user_id     INT           NOT NULL,
    provider    NVARCHAR(50)  NOT NULL,
    provider_id NVARCHAR(255) NOT NULL,
    linked_at   DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_user_oauth_providers       PRIMARY KEY (id),
    CONSTRAINT UQ_user_oauth_providers       UNIQUE (provider, provider_id),
    CONSTRAINT FK_user_oauth_providers_users FOREIGN KEY (user_id) REFERENCES dbo.users (id)
  );
  PRINT 'Created dbo.user_oauth_providers.';
END
ELSE
BEGIN
  PRINT 'dbo.user_oauth_providers already exists — skipping create.';
END
GO

-- 2. Migrate existing OAuth rows into the new table
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'provider_id'
)
BEGIN
  INSERT INTO dbo.user_oauth_providers (user_id, provider, provider_id, linked_at)
  SELECT id, provider, provider_id, GETUTCDATE()
  FROM dbo.users
  WHERE provider <> 'local'
    AND provider_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM dbo.user_oauth_providers op
      WHERE op.user_id = dbo.users.id AND op.provider = dbo.users.provider
    );
  PRINT 'Migrated existing OAuth provider rows.';
END
GO

-- 3. Make password nullable
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'password'
    AND is_nullable = 0
)
BEGIN
  ALTER TABLE dbo.users ALTER COLUMN password NVARCHAR(255) NULL;
  PRINT 'Made dbo.users.password nullable.';
END
GO

-- 4. Null out empty-string passwords left by OAuth-only accounts
UPDATE dbo.users SET password = NULL WHERE password = '';
PRINT 'Nulled empty-string passwords.';
GO

-- 5. Drop provider_id column
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'provider_id'
)
BEGIN
  ALTER TABLE dbo.users DROP COLUMN provider_id;
  PRINT 'Dropped dbo.users.provider_id.';
END
GO

-- 6. Drop provider column (find and drop any default constraint first)
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'provider'
)
BEGIN
  DECLARE @con NVARCHAR(256);
  SELECT @con = dc.name
  FROM sys.default_constraints dc
  JOIN sys.columns c
    ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.users') AND c.name = 'provider';
  IF @con IS NOT NULL
    EXEC('ALTER TABLE dbo.users DROP CONSTRAINT [' + @con + ']');

  ALTER TABLE dbo.users DROP COLUMN provider;
  PRINT 'Dropped dbo.users.provider.';
END
GO

PRINT 'Migration 012 complete.';
GO
