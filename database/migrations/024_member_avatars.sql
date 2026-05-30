-- Migration 024: member avatar storage
-- Stores a single compressed avatar image per member in a separate table.

CREATE TABLE dbo.member_avatars (
  member_id    INT            NOT NULL PRIMARY KEY,
  image_data   VARBINARY(MAX) NOT NULL,
  content_type NVARCHAR(50)   NOT NULL DEFAULT 'image/jpeg',
  updated_at   DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT fk_member_avatars_member
    FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE
);
