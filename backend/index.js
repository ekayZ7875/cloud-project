import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import morgan from "morgan";
import bodyParser from "body-parser";
import passport from "./src/config/passport.js";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./docs/openapi.js";
import logger from "./libs/logger.js";

// ─── Routes ───────────────────────────────────────────────────────────────────
import authRoutes from "./src/routes/auth.routes.js";
import fileRoutes from "./src/routes/file.routes.js";
import folderRoutes from "./src/routes/folder.routes.js";
import shareRoutes from "./src/routes/sharedRoutes.js";
import activityRoutes from "./src/routes/activity.routes.js";
import searchRoutes from "./src/routes/search.routes.js";
import storageRoutes from "./src/routes/storage.routes.js";
import trashRoutes from "./src/routes/trash.routes.js";

// ─── Middlewares ──────────────────────────────────────────────────────────────
import { errorMiddleware } from "./src/middlewares/error.middleware.js";

dotenv.config();

const app = express();

// ─── Core Middleware ──────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.CLIENT_URL, // set this in .env (see .env.example)
    credentials: true,              // required for httpOnly cookies cross-origin
    methods: "GET,POST,PUT,DELETE",
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true })); // form-data payloads
app.use(bodyParser.json());                         // JSON payloads
app.use(cookieParser());
app.use(morgan("dev"));
app.use(passport.initialize());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);           // kept for backward compat if needed
app.use("/api/files", fileRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/share", shareRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/trash", trashRoutes);

// ─── Docs ─────────────────────────────────────────────────────────────────────

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/health", (req, res) =>
  res.status(200).json({ success: true, message: "Chunkly AI API is running" })
);
app.get("/", (req, res) => res.status(200).send("OK"));

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  logger.warn(`Unhandled route: ${req.method} ${req.url}`);
  res.status(404).send("Route not found");
});

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use(errorMiddleware);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () =>
  logger.info(`Server running on port ${PORT}`)
);

logger.info("Morgan enabled");

function shutdown(signal) {
  logger.info(`Received ${signal}. Closing server...`);
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGUSR2", () => shutdown("SIGUSR2"));

export default app;