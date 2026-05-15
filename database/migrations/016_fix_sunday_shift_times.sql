-- One-time migration: update Sunday club nights to start at 12:00
-- Step 1: inspect what Sunday shifts currently exist (run first to verify)
-- SELECT id, name, [date], time_from, time_to,
--        DATENAME(WEEKDAY, [date]) AS day_name
-- FROM dbo.club_nights
-- WHERE (DATEPART(dw, [date]) + @@DATEFIRST - 1) % 7 = 0  -- Sunday regardless of DATEFIRST
-- ORDER BY [date];

-- Step 2: update all Sunday shifts whose start time is NOT already 12:00
UPDATE dbo.club_nights
SET time_from = '12:00'
WHERE (DATEPART(dw, [date]) + @@DATEFIRST - 1) % 7 = 0  -- Sunday regardless of DATEFIRST setting
  AND time_from <> '12:00';
