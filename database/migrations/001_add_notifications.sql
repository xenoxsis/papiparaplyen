-- Migration: add notifications table
-- Run this against the existing database (no data loss)

IF OBJECT_ID('dbo.notifications', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.notifications (
      id          INT            NOT NULL IDENTITY(1,1),
      member_id   INT            NOT NULL,
      type        NVARCHAR(50)   NOT NULL,
      body        NVARCHAR(500)  NOT NULL,
      link        NVARCHAR(255)  NULL,
      is_read     BIT            NOT NULL DEFAULT 0,
      created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_notifications        PRIMARY KEY (id),
      CONSTRAINT FK_notifications_member FOREIGN KEY (member_id) REFERENCES dbo.members (id)
  );
  PRINT 'Created dbo.notifications table.';
END
ELSE
BEGIN
  PRINT 'dbo.notifications table already exists — skipping.';
END
GO
