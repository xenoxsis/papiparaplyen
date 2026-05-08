-- Migration 005: Chat features — message edit/delete, read receipts
-- Run once against dbo schema.

-- ── Message edit tracking ─────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.messages') AND name = 'edited_at'
)
  ALTER TABLE dbo.messages ADD edited_at DATETIME2 NULL;

-- ── Soft delete ───────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.messages') AND name = 'is_deleted'
)
  ALTER TABLE dbo.messages ADD is_deleted BIT NOT NULL DEFAULT 0;

-- ── Per-user per-channel last-read position ───────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name = 'message_last_read' AND type = 'U')
BEGIN
  CREATE TABLE dbo.message_last_read (
    member_id         INT  NOT NULL,
    channel_id        INT  NOT NULL,
    last_message_id   INT  NOT NULL,
    updated_at        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_message_last_read PRIMARY KEY (member_id, channel_id),
    CONSTRAINT FK_mlr_member  FOREIGN KEY (member_id)  REFERENCES dbo.members  (id),
    CONSTRAINT FK_mlr_channel FOREIGN KEY (channel_id) REFERENCES dbo.channels (id)
  );

  CREATE INDEX IX_message_last_read_member ON dbo.message_last_read (member_id);
END
