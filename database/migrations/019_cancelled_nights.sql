-- Migration 019: Add cancellation support to club_nights
-- A confirmed shift (vagt_confirmed = 1) can no longer be deleted — only cancelled.
-- Cancelled nights remain on the events page but are marked "Aflyst".

ALTER TABLE dbo.club_nights
  ADD cancelled BIT NOT NULL DEFAULT 0;

ALTER TABLE dbo.club_nights
  ADD cancelled_at DATETIME2 NULL;
