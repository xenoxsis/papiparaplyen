import { Router, Request, Response, NextFunction } from "express";

const router = Router();

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// ── GET /api/address-autocomplete?q=... ───────────────────────────────────────
// Proxies to api.danskadresseapi.dk so the API key stays server-side.
router.get(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const q = ((req.query.q as string | undefined) ?? "").trim();
    if (!q) {
      res.json([]);
      return;
    }

    const token = process.env.DANISH_ADDRESS_API_TOKEN;
    if (!token) {
      res.status(503).json({ error: "Address API not configured" });
      return;
    }

    const upstream = await fetch(
      `https://api.danskadresseapi.dk/v1/autocomplete?q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!upstream.ok) {
      res.status(502).json({ error: "Upstream address API error" });
      return;
    }

    const data = await upstream.json();
    res.json(data);
  }),
);

export default router;
