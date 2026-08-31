-- =============================================================
-- 028_shift_swaps.sql
-- Mutual shift swaps ("Byt vagt").
--
-- A swap is a targeted 1:1 proposal: member A offers their shift
-- (from_night) in exchange for member B's shift (to_night). B accepts
-- or declines. Accepting trades the two assignments and confirms both.
--
-- This is distinct from a HANDOVER ("Afgiv vagt"), which stays a
-- broadcast chat message in the vagter channel
-- (dbo.messages.type = 'shift_swap').
--
-- Idempotent — safe to re-run.
-- =============================================================

IF OBJECT_ID('dbo.shift_swaps', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.shift_swaps (
        id             INT           NOT NULL IDENTITY(1,1),
        from_member_id INT           NOT NULL,
        from_night_id  INT           NOT NULL,
        to_member_id   INT           NOT NULL,
        to_night_id    INT           NOT NULL,
        message        NVARCHAR(500) NULL,
        -- 'pending' | 'accepted' | 'declined' | 'cancelled' | 'voided'
        status         NVARCHAR(20)  NOT NULL CONSTRAINT DF_shift_swaps_status DEFAULT N'pending',
        created_at     DATETIME2     NOT NULL CONSTRAINT DF_shift_swaps_created_at DEFAULT SYSUTCDATETIME(),
        responded_at   DATETIME2     NULL,
        CONSTRAINT PK_shift_swaps             PRIMARY KEY (id),
        CONSTRAINT FK_shift_swaps_from_member FOREIGN KEY (from_member_id) REFERENCES dbo.members     (id),
        CONSTRAINT FK_shift_swaps_from_night  FOREIGN KEY (from_night_id)  REFERENCES dbo.club_nights (id),
        CONSTRAINT FK_shift_swaps_to_member   FOREIGN KEY (to_member_id)   REFERENCES dbo.members     (id),
        CONSTRAINT FK_shift_swaps_to_night    FOREIGN KEY (to_night_id)    REFERENCES dbo.club_nights (id),
        CONSTRAINT CK_shift_swaps_distinct    CHECK (from_night_id <> to_night_id AND from_member_id <> to_member_id)
    );
END
GO

-- At most one live proposal per offered shift (filtered unique index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_shift_swaps_pending_from_night' AND object_id = OBJECT_ID('dbo.shift_swaps'))
    CREATE UNIQUE INDEX UX_shift_swaps_pending_from_night
        ON dbo.shift_swaps (from_night_id)
        WHERE status = N'pending';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_shift_swaps_to_member_status' AND object_id = OBJECT_ID('dbo.shift_swaps'))
    CREATE INDEX IX_shift_swaps_to_member_status ON dbo.shift_swaps (to_member_id, status);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_shift_swaps_from_member_status' AND object_id = OBJECT_ID('dbo.shift_swaps'))
    CREATE INDEX IX_shift_swaps_from_member_status ON dbo.shift_swaps (from_member_id, status);
GO

-- Lookup by night when a night is reassigned/cancelled/deleted and its
-- pending swaps have to be voided.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_shift_swaps_to_night' AND object_id = OBJECT_ID('dbo.shift_swaps'))
    CREATE INDEX IX_shift_swaps_to_night ON dbo.shift_swaps (to_night_id);
GO
