-- Migration 026: Add dbo.club_boardgames — games owned by the club itself.
-- Mirrors dbo.member_boardgames but without a member (the club has no owner).
-- Idempotent: only creates the table if it does not already exist.

IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'club_boardgames' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.club_boardgames (
        bgg_id INT NOT NULL,
        CONSTRAINT PK_club_boardgames     PRIMARY KEY (bgg_id),
        CONSTRAINT FK_club_boardgames_bgg FOREIGN KEY (bgg_id) REFERENCES dbo.boardgames(bgg_id) ON DELETE CASCADE
    );
END
GO
