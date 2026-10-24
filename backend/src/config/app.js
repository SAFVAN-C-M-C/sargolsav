import express from "express";
import cors from "cors";
import helmet from "helmet";
import healthRouter from "../routes/health.js";
import adminRouter from "../routes/admin.js";
import competitionRouter from "../routes/competitions.js";
import participantRouter from "../routes/participants.js";
import catalogRouter from "../routes/catalog.js";
import candidateRouter from "../routes/candidates.js";
import resultDraftRouter from "../routes/resultDrafts.js";
import resultLifecycleRouter, { publicResultRouter } from "../routes/resultLifecycle.js";
import notFound from "../middleware/notFound.js";
import errorHandler from "../middleware/errorHandler.js";

const app = express();
app.disable("x-powered-by");
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use("/api/health", healthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/competitions/:competitionId", resultDraftRouter);
app.use("/api/admin/competitions/:competitionId", resultLifecycleRouter);
app.use("/api/competitions/:competitionId", publicResultRouter);
app.use("/api/admin/competitions/:competitionId/units", participantRouter);
app.use("/api/admin/competitions/:competitionId/categories", catalogRouter);
app.use("/api/admin/competitions/:competitionId/candidates", candidateRouter);
app.use("/api/admin/competitions", competitionRouter);
app.use("/api", notFound);
app.use(errorHandler);

export default app;
