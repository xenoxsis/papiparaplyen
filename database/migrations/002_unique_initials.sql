-- Migration: enforce unique initials on dbo.members
-- Idempotent — safe to re-run

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'UQ_members_initials'
    AND object_id = OBJECT_ID('dbo.members')
)
BEGIN
  ALTER TABLE dbo.members
    ADD CONSTRAINT UQ_members_initials UNIQUE (initials);
  PRINT 'Added UQ_members_initials constraint.';
END
ELSE
BEGIN
  PRINT 'UQ_members_initials already exists — skipping.';
END
GO
