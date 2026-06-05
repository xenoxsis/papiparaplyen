import sql from "mssql";
import bcrypt from "bcrypt";

// ── Safety + tagging ──────────────────────────────────────────────────────────
// Seeding WRITES and reset DELETES. To make it impossible to mutate the real
// production database, we:
//   1. Refuse to run unless DB_NAME matches a test allowlist (*_test).
//   2. Only ever touch rows tagged as test data (test email / high id ranges).
const TEST_DB_ALLOWLIST = [/_test$/i, /^Paraplyen_test$/i];

export const SEEDED = {
  email: "cypress+admin@example.com",
  password: "CypressP@ss123",
};
const NIGHT_NUMBER_BASE = 90000;
const BGG_ID_BASE = 9000000;

function assertTestDb(cfg: sql.config): void {
  const name = String(cfg.database ?? "");
  if (!TEST_DB_ALLOWLIST.some((re) => re.test(name))) {
    throw new Error(
      `Refusing to seed/reset non-test database "${name}". ` +
        `Set DB_NAME to a value matching *_test (e.g. Paraplyen_test).`,
    );
  }
}

// ── Reset: delete only tagged test rows (FK-safe order) ────────────────────────
export async function reset(cfg: sql.config): Promise<void> {
  assertTestDb(cfg);
  const pool = await new sql.ConnectionPool(cfg).connect();
  try {
    await pool.request().query(`
      DELETE mr FROM dbo.member_roles mr
        JOIN dbo.members m ON m.id = mr.member_id
        WHERE m.email LIKE 'cypress+%@example.com';
      DELETE FROM dbo.club_nights WHERE number >= ${NIGHT_NUMBER_BASE};
      DELETE FROM dbo.club_boardgames WHERE bgg_id >= ${BGG_ID_BASE};
      DELETE FROM dbo.boardgames WHERE bgg_id >= ${BGG_ID_BASE};
      DELETE u FROM dbo.users u
        JOIN dbo.members m ON m.id = u.member_id
        WHERE m.email LIKE 'cypress+%@example.com';
      DELETE FROM dbo.members WHERE email LIKE 'cypress+%@example.com';
    `);
  } finally {
    await pool.close();
  }
}

// ── Seed: deterministic test data ──────────────────────────────────────────────
export async function seed(cfg: sql.config): Promise<void> {
  assertTestDb(cfg);
  await reset(cfg); // idempotent — start from a clean slate
  const pool = await new sql.ConnectionPool(cfg).connect();
  try {
    // bcrypt rounds must match the backend (SALT_ROUNDS = 12) so the stored
    // hash verifies against bcrypt.compare on login.
    const hash = await bcrypt.hash(SEEDED.password, 12);

    const memberRes = await pool
      .request()
      .input("name", sql.NVarChar, "Cypress Admin")
      .input("initials", sql.NVarChar, "CA")
      .input("email", sql.NVarChar, SEEDED.email)
      .query(`
        INSERT INTO dbo.members (name, initials, email, joined_date)
        OUTPUT INSERTED.id
        VALUES (@name, @initials, @email, CAST(GETDATE() AS DATE));
      `);
    const memberId: number = memberRes.recordset[0].id;

    // The users table only has (password, member_id, banned, ...) after
    // migrations 011/012 dropped the email/provider columns.
    await pool
      .request()
      .input("pw", sql.NVarChar, hash)
      .input("mid", sql.Int, memberId)
      .query(
        `INSERT INTO dbo.users (password, member_id, banned) VALUES (@pw, @mid, 0);`,
      );

    await pool
      .request()
      .input("mid", sql.Int, memberId)
      .query(`
        INSERT INTO dbo.member_roles (member_id, role_id)
        SELECT @mid, id FROM dbo.roles WHERE name IN (N'Administrator', N'Vagt');
      `);

    await pool
      .request()
      .input("num", sql.Int, NIGHT_NUMBER_BASE + 1)
      .input("vagt", sql.Int, memberId)
      .query(`
        INSERT INTO dbo.club_nights
          (number, name, date, time_from, time_to, location, vagt_member_id, vagt_confirmed)
        VALUES
          (@num, N'Cypress Klubaften', '2099-01-08', '18:00', '22:00', N'Testlokation', @vagt, 1);
      `);

    await pool.request().query(`
      INSERT INTO dbo.boardgames
        (bgg_id, name, avg_weight, min_players, max_players, year_published, playing_time)
        VALUES (${BGG_ID_BASE + 1}, N'Cypress: The Game', 2.50, 2, 4, 2099, 60);
      INSERT INTO dbo.club_boardgames (bgg_id) VALUES (${BGG_ID_BASE + 1});
    `);
  } finally {
    await pool.close();
  }
}
