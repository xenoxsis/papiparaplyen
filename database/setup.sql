-- =============================================================
-- Paraplyen – MSSQL setup script
-- Run on an empty database. Idempotent: drops objects before
-- recreating them so the script can safely be re-run.
-- Seed data: only the admin@example.com member/user is inserted.
-- =============================================================

-- ---------------------------------------------------------------
-- Drop tables in reverse dependency order
-- ---------------------------------------------------------------
IF OBJECT_ID('dbo.notifications',         'U') IS NOT NULL DROP TABLE dbo.notifications;
IF OBJECT_ID('dbo.messages',              'U') IS NOT NULL DROP TABLE dbo.messages;
IF OBJECT_ID('dbo.channel_members',       'U') IS NOT NULL DROP TABLE dbo.channel_members;
IF OBJECT_ID('dbo.channels',              'U') IS NOT NULL DROP TABLE dbo.channels;
IF OBJECT_ID('dbo.club_night_opt_outs',   'U') IS NOT NULL DROP TABLE dbo.club_night_opt_outs;
IF OBJECT_ID('dbo.club_schedule_reviews', 'U') IS NOT NULL DROP TABLE dbo.club_schedule_reviews;
IF OBJECT_ID('dbo.club_nights',           'U') IS NOT NULL DROP TABLE dbo.club_nights;
IF OBJECT_ID('dbo.member_roles',          'U') IS NOT NULL DROP TABLE dbo.member_roles;
IF OBJECT_ID('dbo.users',                 'U') IS NOT NULL DROP TABLE dbo.users;
IF OBJECT_ID('dbo.roles',                 'U') IS NOT NULL DROP TABLE dbo.roles;
IF OBJECT_ID('dbo.members',               'U') IS NOT NULL DROP TABLE dbo.members;
IF OBJECT_ID('dbo.vagt_checklist',        'U') IS NOT NULL DROP TABLE dbo.vagt_checklist;
IF OBJECT_ID('dbo.vagt_settings',         'U') IS NOT NULL DROP TABLE dbo.vagt_settings;
GO

-- ---------------------------------------------------------------
-- members
-- ---------------------------------------------------------------
CREATE TABLE dbo.members (
    id          INT           NOT NULL IDENTITY(1,1),
    name        NVARCHAR(100) NOT NULL,
    initials    NVARCHAR(10)  NOT NULL,
    email       NVARCHAR(255) NOT NULL,
    joined_date DATE          NOT NULL,
    CONSTRAINT PK_members          PRIMARY KEY (id),
    CONSTRAINT UQ_members_email    UNIQUE      (email),
    CONSTRAINT UQ_members_initials UNIQUE      (initials)
);
GO

-- ---------------------------------------------------------------
-- roles  (small lookup table – no IDENTITY, values are fixed)
-- ---------------------------------------------------------------
CREATE TABLE dbo.roles (
    id   INT           NOT NULL,
    name NVARCHAR(50)  NOT NULL,
    CONSTRAINT PK_roles      PRIMARY KEY (id),
    CONSTRAINT UQ_roles_name UNIQUE      (name)
);
GO

-- ---------------------------------------------------------------
-- users
-- ---------------------------------------------------------------
CREATE TABLE dbo.users (
    id          INT            NOT NULL IDENTITY(1,1),
    password    NVARCHAR(255)  NOT NULL,   -- bcrypt hash ($2b$...)
    provider    NVARCHAR(50)   NOT NULL DEFAULT 'local',
    provider_id NVARCHAR(255)  NULL,
    member_id   INT            NOT NULL,
    banned      BIT            NOT NULL DEFAULT 0,
    email_on_mention BIT       NOT NULL DEFAULT 0,
    email_on_nights  BIT       NOT NULL DEFAULT 0,
    email_on_shift   BIT       NOT NULL DEFAULT 0,
    CONSTRAINT PK_users             PRIMARY KEY (id),
    CONSTRAINT FK_users_members     FOREIGN KEY (member_id) REFERENCES dbo.members (id)
);
GO

-- ---------------------------------------------------------------
-- member_roles
-- ---------------------------------------------------------------
CREATE TABLE dbo.member_roles (
    member_id INT NOT NULL,
    role_id   INT NOT NULL,
    CONSTRAINT PK_member_roles          PRIMARY KEY (member_id, role_id),
    CONSTRAINT FK_member_roles_members  FOREIGN KEY (member_id) REFERENCES dbo.members (id),
    CONSTRAINT FK_member_roles_roles    FOREIGN KEY (role_id)   REFERENCES dbo.roles   (id)
);
GO

-- ---------------------------------------------------------------
-- club_nights
-- ---------------------------------------------------------------
CREATE TABLE dbo.club_nights (
    id              INT            NOT NULL IDENTITY(1,1),
    number          INT            NOT NULL,
    name            NVARCHAR(100)  NOT NULL,
    date            DATE           NOT NULL,
    time_from       NVARCHAR(5)    NOT NULL,
    time_to         NVARCHAR(5)    NOT NULL,
    location        NVARCHAR(255)  NOT NULL,
    vagt_member_id  INT            NULL,
    vagt_confirmed  BIT            NOT NULL DEFAULT 0,
    created_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_club_nights           PRIMARY KEY (id),
    CONSTRAINT UQ_club_nights_number    UNIQUE      (number),
    CONSTRAINT FK_club_nights_vagt      FOREIGN KEY (vagt_member_id) REFERENCES dbo.members (id)
);
GO

-- ---------------------------------------------------------------
-- club_schedule_reviews
-- ---------------------------------------------------------------
CREATE TABLE dbo.club_schedule_reviews (
    id          INT       NOT NULL IDENTITY(1,1),
    member_id   INT       NOT NULL,
    reviewed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_club_schedule_reviews        PRIMARY KEY (id),
    CONSTRAINT UQ_club_schedule_reviews_member UNIQUE      (member_id),
    CONSTRAINT FK_club_schedule_reviews_member FOREIGN KEY (member_id) REFERENCES dbo.members (id)
);
GO

-- ---------------------------------------------------------------
-- club_night_opt_outs
-- ---------------------------------------------------------------
CREATE TABLE dbo.club_night_opt_outs (
    id            INT NOT NULL IDENTITY(1,1),
    club_night_id INT NOT NULL,
    member_id     INT NOT NULL,
    CONSTRAINT PK_club_night_opt_outs         PRIMARY KEY (id),
    CONSTRAINT UQ_club_night_opt_outs_pair    UNIQUE      (club_night_id, member_id),
    CONSTRAINT FK_opt_outs_club_night         FOREIGN KEY (club_night_id) REFERENCES dbo.club_nights (id),
    CONSTRAINT FK_opt_outs_member             FOREIGN KEY (member_id)     REFERENCES dbo.members     (id)
);
GO

-- ---------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------
CREATE TABLE dbo.channels (
    id   INT           NOT NULL IDENTITY(1,1),
    name NVARCHAR(100) NOT NULL,
    type NVARCHAR(50)  NOT NULL,
    CONSTRAINT PK_channels PRIMARY KEY (id)
);

-- Password reset tokens
CREATE TABLE dbo.password_reset_tokens (
    id          INT IDENTITY PRIMARY KEY,
    token       NVARCHAR(64)  NOT NULL UNIQUE,
    member_id   INT           NOT NULL REFERENCES dbo.members(id),
    expires_at  DATETIME2     NOT NULL,
    used        BIT           NOT NULL DEFAULT 0
);
GO

-- ---------------------------------------------------------------
-- channel_members
-- ---------------------------------------------------------------
CREATE TABLE dbo.channel_members (
    channel_id INT NOT NULL,
    member_id  INT NOT NULL,
    CONSTRAINT PK_channel_members         PRIMARY KEY (channel_id, member_id),
    CONSTRAINT FK_channel_members_channel FOREIGN KEY (channel_id) REFERENCES dbo.channels (id),
    CONSTRAINT FK_channel_members_member  FOREIGN KEY (member_id)  REFERENCES dbo.members  (id)
);
GO

-- ---------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------
CREATE TABLE dbo.messages (
    id                  INT            NOT NULL IDENTITY(1,1),
    channel_id          INT            NOT NULL,
    sender_id           INT            NULL,
    body                NVARCHAR(MAX)  NOT NULL,
    sent_at             DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    type                NVARCHAR(50)   NULL,
    shift_night_id      INT            NULL,
    swap_status         NVARCHAR(20)   NULL,
    taken_by_member_id  INT            NULL,
    CONSTRAINT PK_messages         PRIMARY KEY (id),
    CONSTRAINT FK_messages_channel FOREIGN KEY (channel_id) REFERENCES dbo.channels (id),
    CONSTRAINT FK_messages_sender  FOREIGN KEY (sender_id)  REFERENCES dbo.members  (id)
);
GO

-- ---------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------
CREATE TABLE dbo.notifications (
    id          INT            NOT NULL IDENTITY(1,1),
    member_id   INT            NOT NULL,
    type        NVARCHAR(50)   NOT NULL,
    body        NVARCHAR(500)  NOT NULL,
    link        NVARCHAR(255)  NULL,
    is_read     BIT            NOT NULL DEFAULT 0,
    created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_notifications        PRIMARY KEY (id),
    CONSTRAINT FK_notifications_member FOREIGN KEY (member_id) REFERENCES dbo.members (id)
);
GO

-- =============================================================
-- Seed data  (admin@example.com only)
-- =============================================================

-- ---------------------------------------------------------------
-- vagt_settings
-- ---------------------------------------------------------------
CREATE TABLE dbo.vagt_settings (
    [key]   NVARCHAR(100) NOT NULL,
    [value] NVARCHAR(MAX) NOT NULL DEFAULT '',
    CONSTRAINT PK_vagt_settings PRIMARY KEY ([key])
);
GO

-- ---------------------------------------------------------------
-- vagt_checklist
-- ---------------------------------------------------------------
CREATE TABLE dbo.vagt_checklist (
    id          INT           NOT NULL IDENTITY(1,1),
    [text]      NVARCHAR(500) NOT NULL,
    sort_order  INT           NOT NULL DEFAULT 0,
    is_header   BIT           NOT NULL DEFAULT 0,
    CONSTRAINT PK_vagt_checklist PRIMARY KEY (id)
);
GO

-- =============================================================
-- Seed data  (admin@example.com only)
-- =============================================================

-- Roles (fixed lookup values – inserted with explicit IDs)
INSERT INTO dbo.roles (id, name) VALUES (1, N'Vagt'), (2, N'Administrator'), (3, N'Medlem'), (4, N'Tilskuer');
GO

-- Channels
INSERT INTO dbo.channels (name, type) VALUES (N'Alle medlemmer', N'all_members');
INSERT INTO dbo.channels (name, type) VALUES (N'Vagter', N'vagter');
GO

-- Member
INSERT INTO dbo.members (name, initials, email, joined_date)
VALUES (N'Daniel Olsen', N'DO', N'admin@example.com', CAST(GETDATE() AS DATE));
GO

-- User  (password is the bcrypt hash of the original password)
-- Replace admin@example.com with the real admin email and set a proper password hash before deploying.
INSERT INTO dbo.users (email, password, provider, provider_id, member_id, banned)
SELECT N'admin@example.com',
       N'$2b$12$REPLACETHISWITHAREALBCRYPTHASHBEFOREDEPLOYING000000000000',
       N'local', NULL, id, 0
FROM dbo.members WHERE email = N'admin@example.com';
GO

-- Member roles  (Administrator + Vagt)
INSERT INTO dbo.member_roles (member_id, role_id)
SELECT m.id, r.id FROM dbo.members m, dbo.roles r
WHERE m.email = N'admin@example.com' AND r.name IN (N'Vagt', N'Administrator');
GO

-- Vagt settings defaults
INSERT INTO dbo.vagt_settings ([key], [value]) VALUES ('door_code', '');
INSERT INTO dbo.vagt_settings ([key], [value]) VALUES ('locker_code', '');
INSERT INTO dbo.vagt_settings ([key], [value]) VALUES ('shift_note', '');
GO
