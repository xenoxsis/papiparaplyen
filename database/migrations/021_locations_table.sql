CREATE TABLE dbo.locations (
    id         INT            NOT NULL IDENTITY(1,1),
    name       NVARCHAR(100)  NOT NULL,
    address    NVARCHAR(255)  NOT NULL,
    disabled   BIT            NOT NULL DEFAULT 0,
    created_at DATETIME2      NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_locations PRIMARY KEY (id)
);
GO
