-- Migration 027: Mark a single location as the club's default ("Fast lokation").
-- Adds dbo.locations.is_default with a filtered unique index so that at most one
-- location can be the default at a time. Idempotent.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.locations') AND name = 'is_default'
)
BEGIN
    ALTER TABLE dbo.locations
        ADD is_default BIT NOT NULL
        CONSTRAINT DF_locations_is_default DEFAULT 0;
END
GO

-- Enforce at most one default (filtered to rows where is_default = 1).
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_locations_default' AND object_id = OBJECT_ID('dbo.locations')
)
BEGIN
    CREATE UNIQUE INDEX UX_locations_default
        ON dbo.locations (is_default)
        WHERE is_default = 1;
END
GO

-- Seed: if no default is set yet, promote the oldest non-disabled location.
IF NOT EXISTS (SELECT 1 FROM dbo.locations WHERE is_default = 1)
BEGIN
    UPDATE dbo.locations
    SET is_default = 1
    WHERE id = (
        SELECT TOP 1 id FROM dbo.locations WHERE disabled = 0 ORDER BY id ASC
    );
END
GO
