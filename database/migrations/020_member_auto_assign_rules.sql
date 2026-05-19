-- Migration 020: Per-member auto-assign rule flags
-- Lets admins override the auto-assign rules on a per-user basis.
--   rule_allow_two_in_a_row         = 1 disables the "no two consecutive nights" rule for this member
--   rule_allow_weekday_after_sunday = 1 disables the "no weekday after Sunday" rule for this member
--   rule_no_weekends                = 1 blocks the member from being assigned to Sat/Sun nights
-- All default to 0 so existing scheduling behaviour is preserved.

ALTER TABLE dbo.members ADD
  rule_allow_two_in_a_row         BIT NOT NULL DEFAULT 0,
  rule_allow_weekday_after_sunday BIT NOT NULL DEFAULT 0,
  rule_no_weekends                BIT NOT NULL DEFAULT 0;
