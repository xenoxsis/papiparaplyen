import { Router } from "express";
import { getPool, sql } from "../db";
import { requireAuth } from "../auth";

const router = Router();

// ── CSV helpers ──────────────────────────────────────────────────────────────

/** Parse a single CSV line respecting double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

// ── POST /api/boardgames/upload ──────────────────────────────────────────────
// Accepts JSON body { csv: "<file contents>" }. Parses it, filters to own=1,
// upserts games into dbo.boardgames, and syncs dbo.member_boardgames for the
// uploading member.

router.post("/upload", requireAuth, async (req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const csvText: string = req.body?.csv ?? "";

  if (!csvText.trim()) {
    return res.status(400).json({ error: "Empty CSV body" });
  }

  const rows = parseCsv(csvText);
  // Only import games the member currently owns
  const owned = rows.filter((r) => r.own === "1");

  if (owned.length === 0) {
    // Wipe the member's collection (they sold everything or wrong file)
    const pool = await getPool();
    const prevResult = await pool
      .request()
      .input("memberId", sql.Int, memberId)
      .query(
        "SELECT COUNT(*) AS cnt FROM dbo.member_boardgames WHERE member_id = @memberId",
      );
    const prevCount: number = prevResult.recordset[0].cnt;
    await pool
      .request()
      .input("memberId", sql.Int, memberId)
      .query("DELETE FROM dbo.member_boardgames WHERE member_id = @memberId");
    return res.json({ ok: true, imported: 0, removed: prevCount });
  }

  const pool = await getPool();

  // Parse owned rows into plain objects
  const games = owned
    .map((row) => {
      const bggId = parseInt(row.objectid, 10);
      if (!bggId) return null;
      return {
        bgg_id: bggId,
        name: (row.objectname ?? "").slice(0, 255),
        avg_weight: parseFloat(row.avgweight) || null,
        min_players: parseInt(row.minplayers, 10) || null,
        max_players: parseInt(row.maxplayers, 10) || null,
        year_published: parseInt(row.yearpublished, 10) || null,
        playing_time: parseInt(row.playingtime, 10) || null,
      };
    })
    .filter(Boolean);

  if (games.length === 0) {
    const prevResult0 = await pool
      .request()
      .input("memberId", sql.Int, memberId)
      .query(
        "SELECT COUNT(*) AS cnt FROM dbo.member_boardgames WHERE member_id = @memberId",
      );
    const prevCount0: number = prevResult0.recordset[0].cnt;
    await pool
      .request()
      .input("memberId", sql.Int, memberId)
      .query("DELETE FROM dbo.member_boardgames WHERE member_id = @memberId");
    return res.json({ ok: true, imported: 0, removed: prevCount0 });
  }

  // 1. Bulk-upsert all games in one MERGE via OPENJSON
  await pool
    .request()
    .input("games", sql.NVarChar(sql.MAX), JSON.stringify(games)).query(`
        MERGE dbo.boardgames AS target
        USING (
          SELECT
            CAST(j.bgg_id        AS INT)           AS bgg_id,
            CAST(j.name          AS NVARCHAR(255))  AS name,
            CAST(j.avg_weight    AS DECIMAL(4,2))   AS avg_weight,
            CAST(j.min_players   AS INT)            AS min_players,
            CAST(j.max_players   AS INT)            AS max_players,
            CAST(j.year_published AS INT)           AS year_published,
            CAST(j.playing_time  AS INT)            AS playing_time
          FROM OPENJSON(@games) WITH (
            bgg_id        INT            '$.bgg_id',
            name          NVARCHAR(255)  '$.name',
            avg_weight    DECIMAL(4,2)   '$.avg_weight',
            min_players   INT            '$.min_players',
            max_players   INT            '$.max_players',
            year_published INT           '$.year_published',
            playing_time  INT            '$.playing_time'
          ) AS j
        ) AS source ON target.bgg_id = source.bgg_id
        WHEN MATCHED THEN
          UPDATE SET
            name           = source.name,
            avg_weight     = source.avg_weight,
            min_players    = source.min_players,
            max_players    = source.max_players,
            year_published = source.year_published,
            playing_time   = source.playing_time
        WHEN NOT MATCHED THEN
          INSERT (bgg_id, name, avg_weight, min_players, max_players, year_published, playing_time)
          VALUES (source.bgg_id, source.name, source.avg_weight, source.min_players,
                  source.max_players, source.year_published, source.playing_time);
      `);

  // 2. Sync member_boardgames: count existing, delete then re-insert as two separate queries
  const bggIdsJson = JSON.stringify(games.map((g) => g!.bgg_id));
  const prevResult2 = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT COUNT(*) AS cnt FROM dbo.member_boardgames WHERE member_id = @memberId",
    );
  const prevCount2: number = prevResult2.recordset[0].cnt;
  await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query("DELETE FROM dbo.member_boardgames WHERE member_id = @memberId");

  await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .input("bggIds", sql.NVarChar(sql.MAX), bggIdsJson).query(`
        INSERT INTO dbo.member_boardgames (member_id, bgg_id)
        SELECT @memberId, CAST([value] AS INT)
        FROM OPENJSON(@bggIds);
      `);

  const removed = Math.max(0, prevCount2 - games.length);
  return res.json({ ok: true, imported: games.length, removed });
});

// ── GET /api/boardgames ──────────────────────────────────────────────────────
// Public. Returns all games that at least one member with bgg_share_collection=1
// owns. Each game includes an owners array (name may be null if bgg_share_name=0).

router.get("/", async (_req, res) => {
  const pool = await getPool();

  // Get all games owned by at least one sharing member
  const gamesResult = await pool.request().query(`
    SELECT DISTINCT
      bg.bgg_id,
      bg.name,
      bg.avg_weight,
      bg.min_players,
      bg.max_players,
      bg.year_published,
      bg.playing_time
    FROM dbo.boardgames bg
    JOIN dbo.member_boardgames mb ON mb.bgg_id = bg.bgg_id
    JOIN dbo.members m ON m.id = mb.member_id
    JOIN dbo.users u ON u.member_id = m.id
    WHERE u.bgg_share_collection = 1
    ORDER BY bg.name
  `);

  const games = gamesResult.recordset as {
    bgg_id: number;
    name: string;
    avg_weight: number | null;
    min_players: number | null;
    max_players: number | null;
    year_published: number | null;
    playing_time: number | null;
  }[];

  if (games.length === 0) {
    return res.json([]);
  }

  // Get owners for all those games in one query
  const ownersResult = await pool.request().query(`
    SELECT
      mb.bgg_id,
      CASE WHEN u.bgg_share_name = 1 THEN m.name ELSE NULL END AS owner_name
    FROM dbo.member_boardgames mb
    JOIN dbo.members m ON m.id = mb.member_id
    JOIN dbo.users u ON u.member_id = m.id
    WHERE u.bgg_share_collection = 1
  `);

  // Group owners by bgg_id
  const ownerMap = new Map<number, { name: string | null }[]>();
  for (const row of ownersResult.recordset as {
    bgg_id: number;
    owner_name: string | null;
  }[]) {
    const arr = ownerMap.get(row.bgg_id) ?? [];
    arr.push({ name: row.owner_name });
    ownerMap.set(row.bgg_id, arr);
  }

  const result = games.map((g) => ({
    bgg_id: g.bgg_id,
    name: g.name,
    avg_weight: g.avg_weight,
    min_players: g.min_players,
    max_players: g.max_players,
    year_published: g.year_published,
    playing_time: g.playing_time,
    owners: ownerMap.get(g.bgg_id) ?? [],
  }));

  return res.json(result);
});

export default router;
