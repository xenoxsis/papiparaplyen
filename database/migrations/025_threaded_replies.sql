-- Migration 025: Add reply_to_id to messages for threaded (inline-quote) replies
-- Idempotent: only adds the column if it does not already exist.

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.messages')
      AND name = 'reply_to_id'
)
BEGIN
    ALTER TABLE dbo.messages
        ADD reply_to_id INT NULL
            CONSTRAINT FK_messages_reply_to FOREIGN KEY REFERENCES dbo.messages (id);
END
GO
