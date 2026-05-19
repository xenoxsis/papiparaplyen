if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch {
    /* not available in production */
  }
}
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import membersRouter from "./routes/members";
import clubNightsRouter from "./routes/club-nights";
import channelsRouter from "./routes/channels";
import authRouter from "./routes/auth";
import oauthRouter from "./routes/oauth";
import scheduleReviewsRouter from "./routes/schedule-reviews";
import notificationsRouter from "./routes/notifications";
import vagterRouter from "./routes/vagter";
import auditLogRouter from "./routes/audit-log";
import boardgamesRouter from "./routes/boardgames";
import locationsRouter from "./routes/locations";
import addressAutocompleteRouter from "./routes/address-autocomplete";
import { getPool } from "./db";

const app = express();
const PORT = process.env.PORT ?? 3001;

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(helmet());
app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(passport.initialize());

// ── Rate limiting ─────────────────────────────────────────────────────────────

/**
 * Rate-limit key: normalise the IP coming from the reverse proxy.
 * The proxy may forward IPv4 addresses with a port (e.g. "1.2.3.4:5678").
 * Strip the port for plain IPv4 before handing off to ipKeyGenerator so it
 * can safely handle IPv6 subnet bucketing.
 */
function rateLimitKey(req: import("express").Request): string {
  const raw = req.ip ?? req.socket.remoteAddress ?? "";
  // Strip IPv4 port suffix: "1.2.3.4:5678" → "1.2.3.4"  (IPv6 not affected)
  const ip = /^\d+\.\d+\.\d+\.\d+:\d+$/.test(raw)
    ? raw.replace(/:\d+$/, "")
    : raw;
  return ipKeyGenerator(ip);
}

/** Strict limiter for auth endpoints (login, register, password reset). */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: "For mange forsøg, prøv igen om lidt" },
});

/** General API limiter — broad fallback. */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: "For mange forespørgsler, prøv igen om lidt" },
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use(generalLimiter);

app.use("/api/members", membersRouter);
app.use("/api/club-nights", clubNightsRouter);
app.use("/api/channels", channelsRouter);
app.use("/api/auth", authRouter);
app.use("/api/auth", oauthRouter);
app.use("/api/schedule-reviews", scheduleReviewsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/vagter", vagterRouter);
app.use("/api/audit-log", auditLogRouter);
app.use("/api/boardgames", boardgamesRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/address-autocomplete", addressAutocompleteRouter);

app.get("/health", (_, res) => res.json({ ok: true }));

// Global error handler — catches errors forwarded via next(err)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Scrub potential PII (email addresses) from logged error messages
  const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]");
  const safeMsg =
    err instanceof Error ? scrub(err.message) : "Internal server error";
  console.error("[server] Unhandled error:", safeMsg);
  res.status(500).json({ error: safeMsg });
});

// Warm up DB connection then start listening
getPool()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀  Backend running on http://localhost:${PORT}`);
      console.log(`   GET  /api/members`);
      console.log(`   GET  /api/club-nights`);
      console.log(`   GET  /api/channels`);
      console.log(`   POST /api/auth/login\n`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to SQL Server:", err);
    process.exit(1);
  });
