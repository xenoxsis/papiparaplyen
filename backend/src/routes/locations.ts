import { Router, Request, Response, NextFunction } from "express";
import { getPool, sql } from "../db";
import { requireAuth, isAdmin } from "../auth";

const router = Router();

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// ── GET /api/locations ────────────────────────────────────────────────────────
// Returns all non-disabled locations. No auth required.
router.get(
  "/",
  asyncRoute(async (_req: Request, res: Response) => {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, name, address, disabled, is_default, created_at, updated_at
      FROM dbo.locations
      WHERE disabled = 0
      ORDER BY name
    `);
    res.json(result.recordset);
  }),
);

// ── GET /api/locations/default ────────────────────────────────────────────────
// Returns the club's default ("Fast lokation"), or null. No auth required.
router.get(
  "/default",
  asyncRoute(async (_req: Request, res: Response) => {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT TOP 1 id, name, address, disabled, is_default, created_at, updated_at
      FROM dbo.locations
      WHERE is_default = 1 AND disabled = 0
    `);
    res.json(result.recordset[0] ?? null);
  }),
);

// ── POST /api/locations ───────────────────────────────────────────────────────
// Create a new location. Admin only.
router.post(
  "/",
  requireAuth,
  asyncRoute(async (req: Request, res: Response) => {
    if (!isAdmin(res)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const name = (req.body.name as string | undefined)?.trim();
    const address = (req.body.address as string | undefined)?.trim();

    if (!name || !address) {
      res.status(400).json({ error: "name and address are required" });
      return;
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("name", sql.NVarChar, name)
      .input("address", sql.NVarChar, address).query(`
        INSERT INTO dbo.locations (name, address)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.address, INSERTED.disabled, INSERTED.created_at, INSERTED.updated_at
        VALUES (@name, @address)
      `);

    res.status(201).json(result.recordset[0]);
  }),
);

// ── PATCH /api/locations/:id/disable ─────────────────────────────────────────
// Disable a location. Returns 409 if location has future nights attached.
router.patch(
  "/:id/disable",
  requireAuth,
  asyncRoute(async (req: Request, res: Response) => {
    if (!isAdmin(res)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const pool = await getPool();

    // Check for future nights using this location
    const futureCheck = await pool
      .request()
      .input("lid", sql.Int, id)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM dbo.club_nights
        WHERE location_id = @lid AND date >= CAST(GETDATE() AS DATE)
      `);

    if (futureCheck.recordset[0].cnt > 0) {
      res.status(409).json({
        error: "Lokationen er tildelt fremtidige aftener og kan ikke deaktiveres",
      });
      return;
    }

    const result = await pool
      .request()
      .input("id", sql.Int, id).query(`
        UPDATE dbo.locations
        SET disabled = 1, is_default = 0, updated_at = GETDATE()
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.address, INSERTED.disabled, INSERTED.is_default, INSERTED.created_at, INSERTED.updated_at
        WHERE id = @id
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: "Location not found" });
      return;
    }

    res.json(result.recordset[0]);
  }),
);

// ── PATCH /api/locations/:id/default ─────────────────────────────────────────
// Mark a location as the club's default ("Fast lokation"). Admin only.
// Clears the flag on every other location so only one default exists.
router.patch(
  "/:id/default",
  requireAuth,
  asyncRoute(async (req: Request, res: Response) => {
    if (!isAdmin(res)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const pool = await getPool();

    // Target must exist and be active.
    const exists = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`SELECT disabled FROM dbo.locations WHERE id = @id`);

    if (exists.recordset.length === 0) {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    if (exists.recordset[0].disabled) {
      res
        .status(409)
        .json({ error: "En deaktiveret lokation kan ikke være fast lokation" });
      return;
    }

    const tx = pool.transaction();
    await tx.begin();
    try {
      // Clear the existing default first so the filtered unique index never
      // sees two default rows mid-transaction.
      await tx
        .request()
        .query(
          `UPDATE dbo.locations SET is_default = 0, updated_at = GETDATE() WHERE is_default = 1`,
        );
      const result = await tx
        .request()
        .input("id", sql.Int, id).query(`
          UPDATE dbo.locations
          SET is_default = 1, updated_at = GETDATE()
          OUTPUT INSERTED.id, INSERTED.name, INSERTED.address, INSERTED.disabled, INSERTED.is_default, INSERTED.created_at, INSERTED.updated_at
          WHERE id = @id
        `);
      await tx.commit();
      res.json(result.recordset[0]);
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }),
);

export default router;
