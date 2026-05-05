import express from "express";
import cors from "cors";
import membersRouter from "./routes/members";
import clubNightsRouter from "./routes/club-nights";
import channelsRouter from "./routes/channels";
import authRouter from "./routes/auth";
import scheduleReviewsRouter from "./routes/schedule-reviews";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: ["http://localhost:3000", "http://localhost:3001"] }));
app.use(express.json());

app.use("/api/members", membersRouter);
app.use("/api/club-nights", clubNightsRouter);
app.use("/api/channels", channelsRouter);
app.use("/api/auth", authRouter);
app.use("/api/schedule-reviews", scheduleReviewsRouter);

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`\n🚀  Backend running on http://localhost:${PORT}`);
  console.log(`   GET  /api/members`);
  console.log(`   GET  /api/club-nights`);
  console.log(`   GET  /api/channels`);
  console.log(`   POST /api/auth/login\n`);
});
