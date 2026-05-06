import { Router } from "express";
import { getPool, sql } from "../db";
import { callerId, isAdmin, requireAdmin, requireAuth } from "../auth";

const router = Router();

type NightRow = {
  id: number;
  number: number;
  name: string;
  date: string;
  time_from: string;
  time_to: string;
  location: string;
  vagt_member_id: number | null;
  vagt_confirmed: boolean;
  created_at: string;
  updated_at: string;
  assigned_member_name: string | null;
  assigned_member_initials: string | null;
};

async function fetchNightWithOptOuts(
  pool: Awaited<ReturnType<typeof getPool>>,
  nightId: number,
) {
  const nightResult = await pool.request().input("id", sql.Int, nightId).query(`
      SELECT n.id, n.number, n.name,
             CONVERT(varchar(10), n.date, 120) AS date,
             n.time_from, n.time_to, n.location,
             n.vagt_member_id, n.vagt_confirmed,
             n.created_at, n.updated_at,
             vm.name AS assigned_member_name,
             vm.initials AS assigned_member_initials
      FROM dbo.club_nights n
      LEFT JOIN dbo.members vm ON vm.id = n.vagt_member_id
      WHERE n.id = @id
    `);

  const optOutsResult = await pool.request().input("nightId", sql.Int, nightId)
    .query(`
      SELECT m.id, m.name, m.initials
      FROM dbo.club_night_opt_outs o
      JOIN dbo.members m ON m.id = o.member_id
      WHERE o.club_night_id = @nightId
    `);

  return {
    ...nightResult.recordset[0],
    vagt_confirmed:
      nightResult.recordset[0].vagt_confirmed === true ||
      nightResult.recordset[0].vagt_confirmed === 1,
    opted_out_members: optOutsResult.recordset,
  };
}

// GET /api/club-nights
router.get("/", async (_req, res) => {
  const pool = await getPool();
  const nightsResult = await pool.request().query(`
    SELECT n.id, n.number, n.name,
           CONVERT(varchar(10), n.date, 120) AS date,
           n.time_from, n.time_to, n.location,
           n.vagt_member_id, n.vagt_confirmed,
           n.created_at, n.updated_at,
           vm.name AS assigned_member_name,
           vm.initials AS assigned_member_initials
    FROM dbo.club_nights n
    LEFT JOIN dbo.members vm ON vm.id = n.vagt_member_id
    ORDER BY n.date
  `);

  const optOutsResult = await pool.request().query(`
    SELECT o.club_night_id, m.id, m.name, m.initials
    FROM dbo.club_night_opt_outs o
    JOIN dbo.members m ON m.id = o.member_id
  `);

  const nights = nightsResult.recordset.map((n: NightRow) => ({
    ...n,
    vagt_confirmed:
      n.vagt_confirmed === true || (n.vagt_confirmed as unknown) === 1,
    opted_out_members: optOutsResult.recordset
      .filter((o: { club_night_id: number }) => o.club_night_id === n.id)
      .map(
        (o: {
          club_night_id: number;
          id: number;
          name: string;
          initials: string;
        }) => ({
          id: o.id,
          name: o.name,
          initials: o.initials,
        }),
      ),
  }));

  res.json(nights);
});

// POST /api/club-nights
router.post("/", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const pool = await getPool();
  const now = new Date().toISOString();

  // Get next number
  const maxResult = await pool
    .request()
    .query(
      "SELECT ISNULL(MAX(number),0)+1 AS next_number, ISNULL(MAX(id),0)+1 AS next_id FROM dbo.club_nights",
    );
  const nextNumber: number =
    req.body.number ?? maxResult.recordset[0].next_number;

  const insertResult = await pool
    .request()
    .input("number", sql.Int, nextNumber)
    .input("name", sql.NVarChar, req.body.name ?? "Klubaften")
    .input("date", sql.Date, req.body.date)
    .input("timeFrom", sql.NVarChar, req.body.time_from ?? "18:00")
    .input("timeTo", sql.NVarChar, req.body.time_to ?? "23:00")
    .input("location", sql.NVarChar, req.body.location ?? "Kulturhuset")
    .input("vagtMemberId", sql.Int, req.body.vagt_member_id ?? null)
    .input("createdAt", sql.DateTime2, now)
    .input("updatedAt", sql.DateTime2, now).query(`
      INSERT INTO dbo.club_nights
        (number, name, date, time_from, time_to, location, vagt_member_id, vagt_confirmed, created_at, updated_at)
      OUTPUT INSERTED.id
      VALUES (@number, @name, @date, @timeFrom, @timeTo, @location, @vagtMemberId, 0, @createdAt, @updatedAt)
    `);

  const newId: number = insertResult.recordset[0].id;
  return res.status(201).json(await fetchNightWithOptOuts(pool, newId));
});

// PATCH /api/club-nights/:id  — update vagt_member_id / vagt_confirmed
router.patch("/:id", requireAuth, async (req, res) => {
  const caller = callerId(res);
  const assigning = req.body.vagt_member_id;
  const selfAssign = typeof assigning === "number" && assigning === caller;
  if (!selfAssign && !isAdmin(res)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("SELECT vagt_member_id FROM dbo.club_nights WHERE id = @id");
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  if ("vagt_member_id" in req.body && req.body.vagt_member_id !== null) {
    // Block if opted out
    const optCheck = await pool
      .request()
      .input("nightId", sql.Int, nightId)
      .input("memberId", sql.Int, req.body.vagt_member_id)
      .query(
        "SELECT 1 FROM dbo.club_night_opt_outs WHERE club_night_id=@nightId AND member_id=@memberId",
      );
    if (optCheck.recordset.length > 0) {
      return res.status(409).json({ error: "Vagt har meldt fra denne aften" });
    }
    const currentVagt = nightCheck.recordset[0].vagt_member_id;
    const resetConfirm = currentVagt !== req.body.vagt_member_id ? 1 : 0;
    await pool
      .request()
      .input("vagtMemberId", sql.Int, req.body.vagt_member_id)
      .input("resetConfirm", sql.Bit, resetConfirm)
      .input("updatedAt", sql.DateTime2, new Date().toISOString())
      .input("id", sql.Int, nightId).query(`
        UPDATE dbo.club_nights
        SET vagt_member_id = @vagtMemberId,
            vagt_confirmed = CASE WHEN @resetConfirm = 1 THEN 0 ELSE vagt_confirmed END,
            updated_at = @updatedAt
        WHERE id = @id
      `);
  } else if ("vagt_member_id" in req.body) {
    await pool
      .request()
      .input("updatedAt", sql.DateTime2, new Date().toISOString())
      .input("id", sql.Int, nightId).query(`
        UPDATE dbo.club_nights
        SET vagt_member_id = NULL, vagt_confirmed = 0, updated_at = @updatedAt
        WHERE id = @id
      `);
  }

  return res.json(await fetchNightWithOptOuts(pool, nightId));
});

// POST /api/club-nights/:id/confirm
router.post("/:id/confirm", requireAuth, async (req, res) => {
  const caller = callerId(res);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("SELECT vagt_member_id FROM dbo.club_nights WHERE id = @id");
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const vagtMemberId = nightCheck.recordset[0].vagt_member_id;
  if (vagtMemberId !== caller && !isAdmin(res)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await pool
    .request()
    .input("updatedAt", sql.DateTime2, new Date().toISOString())
    .input("id", sql.Int, nightId)
    .query(
      "UPDATE dbo.club_nights SET vagt_confirmed=1, updated_at=@updatedAt WHERE id=@id",
    );

  return res.json(await fetchNightWithOptOuts(pool, nightId));
});

// POST /api/club-nights/:id/opt-out
router.post("/:id/opt-out", requireAuth, async (req, res) => {
  const memberId = callerId(res);
  if (!memberId) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("SELECT 1 FROM dbo.club_nights WHERE id = @id");
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const exists = await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT 1 FROM dbo.club_night_opt_outs WHERE club_night_id=@nightId AND member_id=@memberId",
    );
  if (exists.recordset.length > 0) return res.status(200).json({ ok: true });

  await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .input("memberId", sql.Int, memberId)
    .query(
      "INSERT INTO dbo.club_night_opt_outs (club_night_id, member_id) VALUES (@nightId, @memberId)",
    );

  return res.status(201).json({ ok: true });
});

// DELETE /api/club-nights/:id/opt-out
router.delete("/:id/opt-out", requireAuth, async (req, res) => {
  const memberId = callerId(res);
  if (!memberId) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  await pool
    .request()
    .input("nightId", sql.Int, Number(req.params.id))
    .input("memberId", sql.Int, memberId)
    .query(
      "DELETE FROM dbo.club_night_opt_outs WHERE club_night_id=@nightId AND member_id=@memberId",
    );

  return res.status(200).json({ ok: true });
});

// DELETE /api/club-nights/:id — admin only
router.delete("/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("SELECT 1 FROM dbo.club_nights WHERE id = @id");
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .query(
      "DELETE FROM dbo.club_night_opt_outs WHERE club_night_id = @nightId",
    );
  await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("DELETE FROM dbo.club_nights WHERE id = @id");

  return res.status(200).json({ ok: true });
});

export default router;
