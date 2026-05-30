import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { getPool, sql } from "../db";
import { requireAuth } from "../auth";

// ── Config ──────────────────────────────────────────────────────────────────
// Roles allowed to upload an avatar. Extend this array to open up to more roles.
const AVATAR_UPLOAD_ROLES: string[] = ["Vagt", "Administrator"];

const OUTPUT_SIZE = 256; // px
const OUTPUT_QUALITY = 80; // JPEG quality

// Accept images only, max 10 MB raw (will be compressed server-side)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const router = Router();

// ── GET /api/members/:id/avatar — public, streams the stored image ───────────
router.get("/:id/avatar", async (req, res) => {
  const memberId = parseInt(req.params.id, 10);
  if (isNaN(memberId)) return res.status(400).json({ error: "Invalid id" });

  const pool = await getPool();
  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT image_data, content_type FROM dbo.member_avatars WHERE member_id = @memberId",
    );

  if (result.recordset.length === 0) return res.status(404).end();

  const { image_data, content_type } = result.recordset[0];
  res.setHeader("Content-Type", content_type as string);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("ETag", `"avatar-${memberId}"`);
  res.end(image_data as Buffer);
});

// ── POST /api/members/me/avatar — upload & store avatar ──────────────────────
router.post(
  "/me/avatar",
  requireAuth,
  upload.single("image"),
  async (req, res) => {
    const roles: string[] = res.locals.jwt.roles ?? [];
    const allowed = roles.some((r) => AVATAR_UPLOAD_ROLES.includes(r));
    if (!allowed) {
      return res.status(403).json({ error: "Not allowed to upload an avatar" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const memberId: number = res.locals.jwt.memberId;

    // Resize + compress to OUTPUT_SIZE x OUTPUT_SIZE JPEG
    const compressed = await sharp(req.file.buffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "centre" })
      .jpeg({ quality: OUTPUT_QUALITY })
      .toBuffer();

    const pool = await getPool();
    await pool
      .request()
      .input("memberId", sql.Int, memberId)
      .input("imageData", sql.VarBinary(sql.MAX), compressed)
      .input("contentType", sql.NVarChar(50), "image/jpeg").query(`
        MERGE dbo.member_avatars AS target
        USING (SELECT @memberId AS member_id) AS source ON target.member_id = source.member_id
        WHEN MATCHED THEN
          UPDATE SET image_data = @imageData, content_type = @contentType, updated_at = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (member_id, image_data, content_type)
          VALUES (@memberId, @imageData, @contentType);
      `);

    res.json({ ok: true, size: compressed.length });
  },
);

// ── DELETE /api/members/me/avatar — remove stored avatar ─────────────────────
router.delete("/me/avatar", requireAuth, async (_req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const pool = await getPool();
  await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query("DELETE FROM dbo.member_avatars WHERE member_id = @memberId");
  res.json({ ok: true });
});

export default router;
