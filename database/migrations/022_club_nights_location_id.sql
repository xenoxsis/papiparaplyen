INSERT INTO dbo.locations (name, address)
VALUES (N'Café Finns Paraply', N'Finsensgade 11E, 6700 Esbjerg');

ALTER TABLE dbo.club_nights ADD location_id INT NULL;

ALTER TABLE dbo.club_nights ADD CONSTRAINT FK_club_nights_location
    FOREIGN KEY (location_id) REFERENCES dbo.locations (id);

UPDATE dbo.club_nights
SET location_id = (SELECT TOP 1 id FROM dbo.locations ORDER BY id ASC);
GO
