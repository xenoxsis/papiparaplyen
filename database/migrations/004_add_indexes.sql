-- Migration 004: Add performance indexes
-- Improves message query performance when fetching by channel
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_messages_channel_sent'
    AND object_id = OBJECT_ID('dbo.messages')
)
  CREATE INDEX IX_messages_channel_sent ON dbo.messages (channel_id, sent_at);

-- Improves notification query performance when fetching by member
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_notifications_member'
    AND object_id = OBJECT_ID('dbo.notifications')
)
  CREATE INDEX IX_notifications_member ON dbo.notifications (member_id, created_at DESC);
