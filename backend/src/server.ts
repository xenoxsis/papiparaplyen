if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch {
    /* not available in production */
  }
}
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import passport from "passport";
import membersRouter from "./routes/members";
import clubNightsRouter from "./routes/club-nights";
import channelsRouter from "./routes/channels";
import authRouter from "./routes/auth";
import oauthRouter from "./routes/oauth";
import scheduleReviewsRouter from "./routes/schedule-reviews";
import notificationsRouter from "./routes/notifications";
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
app.use(passport.initialize());

app.use("/api/members", membersRouter);
app.use("/api/club-nights", clubNightsRouter);
app.use("/api/channels", channelsRouter);
app.use("/api/auth", authRouter);
app.use("/api/auth", oauthRouter);
app.use("/api/schedule-reviews", scheduleReviewsRouter);
app.use("/api/notifications", notificationsRouter);

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
