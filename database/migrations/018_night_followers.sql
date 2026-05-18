-- 018_night_followers.sql
-- Lets authenticated members follow individual club nights.
-- When a followed night is edited or deleted they receive a notification + email.

CREATE TABLE dbo.club_night_followers (
  club_night_id INT NOT NULL
    REFERENCES dbo.club_nights(id) ON DELETE CASCADE,
  member_id     INT NOT NULL
    REFERENCES dbo.members(id) ON DELETE CASCADE,
  created_at    DATETIME2 NOT NULL DEFAULT GETDATE(),
  PRIMARY KEY (club_night_id, member_id)
);
