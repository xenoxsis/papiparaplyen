-- =============================================================
-- Migration 006: Vagter page tables
-- Adds vagt_settings (key-value store) and vagt_checklist
-- =============================================================

-- vagt_settings: simple key/value config editable by admins
IF OBJECT_ID('dbo.vagt_settings', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.vagt_settings (
        [key]   NVARCHAR(100) NOT NULL,
        [value] NVARCHAR(MAX) NOT NULL DEFAULT '',
        CONSTRAINT PK_vagt_settings PRIMARY KEY ([key])
    );
END
GO

-- Seed default rows (door code, locker code, shift note)
IF NOT EXISTS (SELECT 1 FROM dbo.vagt_settings WHERE [key] = 'door_code')
    INSERT INTO dbo.vagt_settings ([key], [value]) VALUES ('door_code', '');
IF NOT EXISTS (SELECT 1 FROM dbo.vagt_settings WHERE [key] = 'locker_code')
    INSERT INTO dbo.vagt_settings ([key], [value]) VALUES ('locker_code', '');
IF NOT EXISTS (SELECT 1 FROM dbo.vagt_settings WHERE [key] = 'shift_note')
    INSERT INTO dbo.vagt_settings ([key], [value]) VALUES ('shift_note', '');
GO

-- vagt_checklist: admin-managed list of checklist items for Vagter
IF OBJECT_ID('dbo.vagt_checklist', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.vagt_checklist (
        id          INT            NOT NULL IDENTITY(1,1),
        [text]      NVARCHAR(500)  NOT NULL,
        sort_order  INT            NOT NULL DEFAULT 0,
        CONSTRAINT PK_vagt_checklist PRIMARY KEY (id)
    );
END
GO
