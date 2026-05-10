-- Migration 009: email consent versioning
-- Tracks which version of the email consent form each user has completed.
-- When new email notification types are added, bump CURRENT_EMAIL_CONSENT_VERSION
-- in backend/src/routes/auth.ts — all users with a lower version will see
-- the consent modal again on next login.
-- Idempotent — safe to re-run

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users') AND name = 'email_consent_version'
)
BEGIN
  ALTER TABLE dbo.users
    ADD email_consent_version INT NOT NULL DEFAULT 0;
  PRINT 'Added email_consent_version column to dbo.users.';
END
ELSE
BEGIN
  PRINT 'email_consent_version already exists — skipping.';
END
GO

PRINT 'Migration 009 (email consent versioning) complete.';
GO
