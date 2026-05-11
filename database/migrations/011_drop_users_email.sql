-- Migration 011: remove redundant dbo.users.email column
-- All email lookups use dbo.members.email. The users.email column
-- was always set to the same value on insert and never read directly.
-- Idempotent — safe to re-run

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'email'
)
BEGIN
  -- Dynamically find and drop the unique constraint on users.email
  DECLARE @con NVARCHAR(256);
  SELECT @con = kc.name
  FROM sys.key_constraints kc
  WHERE kc.parent_object_id = OBJECT_ID('dbo.users')
    AND kc.type = 'UQ'
    AND EXISTS (
      SELECT 1
      FROM sys.index_columns ic
      JOIN sys.columns c
        ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE ic.object_id = kc.parent_object_id
        AND ic.index_id = kc.unique_index_id
        AND c.name = 'email'
    );
  IF @con IS NOT NULL
    EXEC('ALTER TABLE dbo.users DROP CONSTRAINT [' + @con + ']');

  ALTER TABLE dbo.users DROP COLUMN email;
  PRINT 'Dropped dbo.users.email and its unique constraint.';
END
ELSE
BEGIN
  PRINT 'dbo.users.email does not exist — skipping.';
END
GO

PRINT 'Migration 011 complete.';
GO
