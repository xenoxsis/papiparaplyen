-- 014_virtual_members.sql
-- Adds support for "virtual" members (placeholder vagter without a login account).
--
-- is_virtual      : when 1, this member has no dbo.users row, receives no emails,
--                   and their assigned shifts are auto-confirmed.
-- show_on_about_page : when 0, this member is hidden from the public "Om os" page.
--                      Defaults to 1 so existing members are unaffected.

ALTER TABLE dbo.members
  ADD is_virtual       BIT NOT NULL DEFAULT 0,
      show_on_about_page BIT NOT NULL DEFAULT 1;
