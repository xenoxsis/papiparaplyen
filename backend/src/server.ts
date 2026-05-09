if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch {
    /* not available in production */
  }
}
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import rateLimit from "express-rate-limit";
import membersRouter from "./routes/members";
import clubNightsRouter from "./routes/club-nights";
import channelsRouter from "./routes/channels";
import authRouter from "./routes/auth";
import oauthRouter from "./routes/oauth";
import scheduleReviewsRouter from "./routes/schedule-reviews";
import notificationsRouter from "./routes/notifications";
import vagterRouter from "./routes/vagter";
import { getPool } from "./db";

const app = express();
const PORT = process.env.PORT ?? 3001;

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// ── Rate limiting ─────────────────────────────────────────────────────────────

/** Strict limiter for auth endpoints (login, register, password reset). */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "For mange forsøg, prøv igen om lidt" },
});

/** General API limiter — broad fallback. */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
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

app.get("/health", (_, res) => res.json({ ok: true }));

// Global error handler — catches errors forwarded via next(err)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] Unhandled error:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
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
