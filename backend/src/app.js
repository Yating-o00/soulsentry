import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { creditsRouter } from "./routes/credits.js";
import { tasksRouter } from "./routes/tasks.js";
import { notesRouter } from "./routes/notes.js";
import { taskExecutionsRouter } from "./routes/taskExecutions.js";
import { functionsRouter } from "./routes/functions.js";
import { weeklyPlansRouter } from "./routes/weeklyPlans.js";
import { monthlyPlansRouter } from "./routes/monthlyPlans.js";

export const app = express();

app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN.split(",").map((item) => item.trim()),
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.json({
    service: "soulsentry-backend",
    docs: "/api/health"
  });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/credits", creditsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/notes", notesRouter);
app.use("/api/task-executions", taskExecutionsRouter);
app.use("/api/weekly-plans", weeklyPlansRouter);
app.use("/api/monthly-plans", monthlyPlansRouter);
app.use("/api/functions", functionsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "服务端发生未处理异常"
  });
});
