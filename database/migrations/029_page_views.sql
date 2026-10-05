-- =============================================================
-- 029_page_views.sql
-- Anonymous, cookie-less page-view tracking for the admin
-- statistics page (/member/admin/stats).
--
-- No personal data is stored: visitor_hash is a truncated SHA-256
-- of (daily rotating in-memory salt + IP + User-Agent). The salt is
-- never persisted, so a hash cannot be linked back to an IP or to
-- the same visitor on another day. It only lets us count unique
-- visitors per day.
--
-- Rows older than 365 days are purged by the daily retention job.
--
-- Idempotent — safe to re-run.
-- =============================================================

IF OBJECT_ID('dbo.page_views', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.page_views (
        id            BIGINT        NOT NULL IDENTITY(1,1),
        path          NVARCHAR(300) NOT NULL,
        referrer_host NVARCHAR(255) NULL,      -- external referrer, first view of a visit only
        visitor_hash  CHAR(16)      NOT NULL,
        is_member     BIT           NOT NULL CONSTRAINT DF_page_views_is_member DEFAULT 0,
        device        NVARCHAR(10)  NOT NULL,  -- 'mobile' | 'tablet' | 'desktop'
        created_at    DATETIME2     NOT NULL CONSTRAINT DF_page_views_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_page_views PRIMARY KEY (id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_page_views_created_at' AND object_id = OBJECT_ID('dbo.page_views'))
    CREATE INDEX IX_page_views_created_at
        ON dbo.page_views (created_at)
        INCLUDE (path, visitor_hash, is_member, device, referrer_host);
GO
