-- =============================================================
-- Paraplyen – MSSQL setup script
-- Run on an empty database. Idempotent: drops objects before
-- recreating them so the script can safely be re-run.
-- Seed data: only the admin@example.com member/user is inserted.
-- =============================================================

-- ---------------------------------------------------------------
-- Drop tables in reverse dependency order
-- ---------------------------------------------------------------
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
GO

-- ---------------------------------------------------------------
-- members
-- ---------------------------------------------------------------
CREATE TABLE dbo.members (
    id          INT           NOT NULL,
    name        NVARCHAR(100) NOT NULL,
    initials    NVARCHAR(10)  NOT NULL,
    email       NVARCHAR(255) NOT NULL,
    joined_date DATE          NOT NULL,
    CONSTRAINT PK_members       PRIMARY KEY (id),
    CONSTRAINT UQ_members_email UNIQUE      (email)
);
GO

-- ---------------------------------------------------------------
-- roles
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
    id          INT            NOT NULL,
    email       NVARCHAR(255)  NOT NULL,
    password    NVARCHAR(255)  NOT NULL,   -- bcrypt hash ($2b$...)
    provider    NVARCHAR(50)   NOT NULL DEFAULT 'local',
    provider_id NVARCHAR(255)  NULL,
    member_id   INT            NOT NULL,
    banned      BIT            NOT NULL DEFAULT 0,
    CONSTRAINT PK_users             PRIMARY KEY (id),
    CONSTRAINT UQ_users_email       UNIQUE      (email),
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
    id              INT            NOT NULL,
    number          INT            NOT NULL,
    name            NVARCHAR(100)  NOT NULL,
    date            DATE           NOT NULL,
    time_from       NVARCHAR(5)    NOT NULL,   -- e.g. '18:00'
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
    id          INT       NOT NULL,
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
    id            INT NOT NULL,
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
    id   INT           NOT NULL,
    name NVARCHAR(100) NOT NULL,
    type NVARCHAR(50)  NOT NULL,   -- e.g. 'all_members', 'vagter'
    CONSTRAINT PK_channels PRIMARY KEY (id)
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
    id         INT            NOT NULL,
    channel_id INT            NOT NULL,
    sender_id  INT            NOT NULL,
    body       NVARCHAR(MAX)  NOT NULL,
    sent_at    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_messages         PRIMARY KEY (id),
    CONSTRAINT FK_messages_channel FOREIGN KEY (channel_id) REFERENCES dbo.channels (id),
    CONSTRAINT FK_messages_sender  FOREIGN KEY (sender_id)  REFERENCES dbo.members  (id)
);
GO

-- =============================================================
-- Seed data  (admin@example.com only)
-- =============================================================

-- Roles (lookup data – always needed)
INSERT INTO dbo.roles (id, name) VALUES
    (1, N'Vagt'),
    (2, N'Administrator'),
    (3, N'Medlem');
GO

-- Member
INSERT INTO dbo.members (id, name, initials, email, joined_date) VALUES
    (1, N'Daniel Olsen', N'DO', N'admin@example.com', CAST(GETDATE() AS DATE));
GO

-- User  (password is the bcrypt hash of the original password)
INSERT INTO dbo.users (id, email, password, provider, provider_id, member_id, banned) VALUES
    (1, N'admin@example.com', N'$2b$12$REPLACETHISWITHAREALBCRYPTHASHBEFOREDEPLOYING000000000000', N'local', NULL, 1, 0);
GO

-- Member roles  (Administrator + Vagt)
INSERT INTO dbo.member_roles (member_id, role_id) VALUES
    (1, 1),   -- Vagt
    (1, 2);   -- Administrator
GO
