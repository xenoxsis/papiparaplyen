-- 015_boardgames.sql
-- Adds board game collection support.
--
-- boardgames          : one record per unique BGG game (keyed by bgg_id)
-- member_boardgames   : which members own which games
-- users additions     : opt-in flags for whether to share collection / show name

-- Games catalogue
IF OBJECT_ID('dbo.boardgames', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.boardgames (
    bgg_id          INT           NOT NULL,
    name            NVARCHAR(255) NOT NULL,
    avg_weight      DECIMAL(4,2)  NULL,
    min_players     INT           NULL,
    max_players     INT           NULL,
    year_published  INT           NULL,
    playing_time    INT           NULL,
    CONSTRAINT PK_boardgames PRIMARY KEY (bgg_id)
  );
END
GO

-- Member ↔ game ownership
IF OBJECT_ID('dbo.member_boardgames', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.member_boardgames (
    member_id INT NOT NULL,
    bgg_id    INT NOT NULL,
    CONSTRAINT PK_member_boardgames          PRIMARY KEY (member_id, bgg_id),
    CONSTRAINT FK_member_boardgames_member   FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE,
    CONSTRAINT FK_member_boardgames_bgg      FOREIGN KEY (bgg_id)    REFERENCES dbo.boardgames(bgg_id) ON DELETE CASCADE
  );
END
GO

-- Per-user BGG sharing preferences
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'bgg_share_collection'
)
BEGIN
  ALTER TABLE dbo.users
    ADD bgg_share_collection BIT NOT NULL DEFAULT 1,
        bgg_share_name       BIT NOT NULL DEFAULT 1;
END
GO
