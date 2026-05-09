-- =============================================================
-- Migration 007: Add is_header column to vagt_checklist
-- Allows checklist rows to act as section headers (no checkbox)
-- =============================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.vagt_checklist') AND name = 'is_header'
)
BEGIN
    ALTER TABLE dbo.vagt_checklist
        ADD is_header BIT NOT NULL DEFAULT 0;
END
GO
