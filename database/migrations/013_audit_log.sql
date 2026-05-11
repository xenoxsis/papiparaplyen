-- Migration 013: audit_log table
-- Stores structured audit events: logins, emails sent, and schedule mutations.
-- Entries older than 90 days are purged by the daily retention cleanup job.

IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('dbo.audit_log')
)
BEGIN
  CREATE TABLE dbo.audit_log (
    id                INT            NOT NULL IDENTITY(1,1),
    event_type        NVARCHAR(50)   NOT NULL,
    actor_member_id   INT            NULL,
    actor_email       NVARCHAR(255)  NULL,   -- denormalised: survives member deletion
    target_member_id  INT            NULL,
    target_email      NVARCHAR(255)  NULL,   -- denormalised: survives member deletion
    detail            NVARCHAR(MAX)  NULL,   -- JSON blob
    ip                NVARCHAR(45)   NULL,
    created_at        DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_audit_log PRIMARY KEY (id)
  );

  CREATE INDEX IX_audit_log_created_at  ON dbo.audit_log (created_at DESC);
  CREATE INDEX IX_audit_log_event_type  ON dbo.audit_log (event_type);
  CREATE INDEX IX_audit_log_actor       ON dbo.audit_log (actor_member_id) WHERE actor_member_id IS NOT NULL;

  PRINT 'Created dbo.audit_log.';
END
ELSE
BEGIN
  PRINT 'dbo.audit_log already exists — skipping.';
END
GO

PRINT 'Migration 013 complete.';
GO
