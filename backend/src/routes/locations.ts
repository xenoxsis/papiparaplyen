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
      SELECT id, name, address, disabled, created_at, updated_at
      FROM dbo.locations
      WHERE disabled = 0
      ORDER BY name
    `);
    res.json(result.recordset);
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
        SET disabled = 1, updated_at = GETDATE()
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.address, INSERTED.disabled, INSERTED.created_at, INSERTED.updated_at
        WHERE id = @id
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: "Location not found" });
      return;
    }

    res.json(result.recordset[0]);
  }),
);

export default router;
