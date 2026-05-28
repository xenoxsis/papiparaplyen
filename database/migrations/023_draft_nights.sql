-- Migration 023: Add status column to club_nights for draft mode support.
-- New nights are inserted as 'draft' and are only visible to administrators
-- until explicitly published via POST /api/club-nights/publish-drafts.
-- Valid values: 'draft' | 'published'

ALTER TABLE dbo.club_nights
    ADD [status] NVARCHAR(20) NOT NULL DEFAULT N'published';
GO
