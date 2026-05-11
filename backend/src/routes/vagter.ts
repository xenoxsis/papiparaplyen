import { Router, Request, Response, NextFunction } from "express";
import { getPool, sql } from "../db";
import { requireAuth, isAdmin, callerId } from "../auth";
import { logEvent } from "../audit";

const router = Router();

/** Wraps an async route handler so unhandled errors are forwarded via next(). */
const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasVagtRole(res: Response): boolean {
  const roles: string[] =
    (res.locals.jwt as { roles?: string[] } | undefined)?.roles ?? [];
  return roles.includes("Vagt") || roles.includes("Administrator");
}

// ── GET /api/vagter ───────────────────────────────────────────────────────────
// Returns settings (door_code, locker_code, shift_note) and checklist items.
// Requires Vagt or Administrator role.
router.get(
  "/",
  requireAuth,
  asyncRoute(async (_req: Request, res: Response) => {
    if (!hasVagtRole(res)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const pool = await getPool();

    const [settingsResult, checklistResult] = await Promise.all([
      pool.request().query(`SELECT [key], [value] FROM dbo.vagt_settings`),
      pool
        .request()
        .query(
          `SELECT id, [text], sort_order, is_header FROM dbo.vagt_checklist ORDER BY sort_order ASC, id ASC`,
        ),
    ]);

    const settings: Record<string, string> = {};
    for (const row of settingsResult.recordset as {
      key: string;
      value: string;
    }[]) {
      settings[row.key] = row.value;
    }

    res.json({
      settings: {
        door_code: settings["door_code"] ?? "",
        locker_code: settings["locker_code"] ?? "",
        shift_note: settings["shift_note"] ?? "",
      },
      checklist: (
        checklistResult.recordset as {
          id: number;
          text: string;
          sort_order: number;
          is_header: boolean | number;
        }[]
      ).map((r) => ({ ...r, is_header: !!r.is_header })),
    });
  }),
);

// ── PUT /api/vagter/settings ──────────────────────────────────────────────────
// Update one or more setting keys. Body: { door_code?, locker_code?, shift_note? }
// Requires Administrator role.
router.put(
  "/settings",
  requireAuth,
  asyncRoute(async (req: Request, res: Response) => {
    if (!isAdmin(res)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const allowed = ["door_code", "locker_code", "shift_note"];
    const updates = req.body as Record<string, string>;
    const pool = await getPool();

    for (const key of allowed) {
      if (key in updates) {
        await pool
          .request()
          .input("k", sql.NVarChar, key)
          .input("v", sql.NVarChar, String(updates[key]))
          .query(
            `MERGE dbo.vagt_settings AS t
             USING (SELECT @k AS [key], @v AS [value]) AS s
               ON t.[key] = s.[key]
             WHEN MATCHED THEN UPDATE SET t.[value] = s.[value]
             WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (s.[key], s.[value]);`,
          );
      }
    }

    const changedKeys = allowed.filter((k) => k in updates);
    logEvent({
      eventType: "vagter.settings",
      actorMemberId: callerId(res),
      detail: {
        changed: changedKeys,
        values: Object.fromEntries(changedKeys.map((k) => [k, updates[k]])),
      },
    });

    res.json({ ok: true });
  }),
);

// ── POST /api/vagter/checklist ────────────────────────────────────────────────
// Add a new checklist item. Body: { text: string, sort_order?: number }
// Requires Administrator role.
router.post(
  "/checklist",
  requireAuth,
  asyncRoute(async (req: Request, res: Response) => {
    if (!isAdmin(res)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { text, sort_order } = req.body as {
      text: string;
      sort_order?: number;
    };
    if (!text?.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const { is_header } = req.body as { is_header?: boolean };

    const pool = await getPool();
    const result = await pool
      .request()
      .input("text", sql.NVarChar, text.trim())
      .input("sort_order", sql.Int, sort_order ?? 0)
      .input("is_header", sql.Bit, is_header ? 1 : 0)
      .query(
        `INSERT INTO dbo.vagt_checklist ([text], sort_order, is_header)
         OUTPUT INSERTED.id, INSERTED.[text], INSERTED.sort_order, INSERTED.is_header
         VALUES (@text, @sort_order, @is_header)`,
      );

    res.status(201).json({
      ...result.recordset[0],
      is_header: !!result.recordset[0].is_header,
    });
    logEvent({
      eventType: "vagter.checklist_create",
      actorMemberId: callerId(res),
      detail: {
        id: result.recordset[0].id,
        text: text.trim(),
        is_header: !!is_header,
      },
    });
  }),
);

// ── PATCH /api/vagter/checklist/:id ──────────────────────────────────────────
// Update checklist item text and/or sort_order.
// Requires Administrator role.
router.patch(
  "/checklist/:id",
  requireAuth,
  asyncRoute(async (req: Request, res: Response) => {
    if (!isAdmin(res)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const id = Number(req.params.id);
    const { text, sort_order, is_header } = req.body as {
      text?: string;
      sort_order?: number;
      is_header?: boolean;
    };

    const pool = await getPool();

    // Check existence
    const existing = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`SELECT id FROM dbo.vagt_checklist WHERE id = @id`);

    if (existing.recordset.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const setClauses: string[] = [];
    const request = pool.request().input("id", sql.Int, id);

    if (text !== undefined) {
      setClauses.push("[text] = @text");
      request.input("text", sql.NVarChar, text.trim());
    }
    if (sort_order !== undefined) {
      setClauses.push("sort_order = @sort_order");
      request.input("sort_order", sql.Int, sort_order);
    }
    if (is_header !== undefined) {
      setClauses.push("is_header = @is_header");
      request.input("is_header", sql.Bit, is_header ? 1 : 0);
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const result = await request.query(
      `UPDATE dbo.vagt_checklist SET ${setClauses.join(", ")}
       OUTPUT INSERTED.id, INSERTED.[text], INSERTED.sort_order, INSERTED.is_header
       WHERE id = @id`,
    );

    res.json({
      ...result.recordset[0],
      is_header: !!result.recordset[0].is_header,
    });
    logEvent({
      eventType: "vagter.checklist_edit",
      actorMemberId: callerId(res),
      detail: { id, changes: { text, sort_order, is_header } },
    });
  }),
);

// ── DELETE /api/vagter/checklist/:id ─────────────────────────────────────────
// Remove a checklist item.
// Requires Administrator role.
router.delete(
  "/checklist/:id",
  requireAuth,
  asyncRoute(async (req: Request, res: Response) => {
    if (!isAdmin(res)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const id = Number(req.params.id);
    const pool = await getPool();

    await pool
      .request()
      .input("id", sql.Int, id)
      .query(`DELETE FROM dbo.vagt_checklist WHERE id = @id`);

    logEvent({
      eventType: "vagter.checklist_delete",
      actorMemberId: callerId(res),
      detail: { id },
    });
    res.json({ ok: true });
  }),
);

export default router;
