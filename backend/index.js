import http from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import morgan from "morgan";
import bodyParser from "body-parser";
import passport from "./config/passport.js";
import authRoutes from "./routes/auth.routes.js";
import fileRoutes from "./routes/file.routes.js";
import folderRoutes from "./routes/folder.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import shareRoutes from "./routes/share.routes.js";
import sharedRoutes from "./routes/sharedRoutes.js";
import activityRoutes from "./routes/activity.routes.js";
import searchRoutes from "./routes/search.routes.js";
import storageRoutes from "./routes/storage.routes.js";
import trashRoutes from "./routes/trash.routes.js";
import healthRoutes from "./routes/health.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./docs/openapi.js";
import logger from "./libs/logger.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

dotenv.config();

const app = express();

// ─── Core Middleware ──────────────────────────────────────────────────────────

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((url) => url.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      const isVercelPreview = origin.startsWith("https://chunkly-dashboard-") && origin.endsWith(".vercel.app");
      
      if (allowedOrigins.includes(origin) || origin === "http://localhost:5173" || origin === "http://localhost:3000" || isVercelPreview) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
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
app.use("/api/folder", folderRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/share", shareRoutes);
app.use("/api/shared", sharedRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/trash", trashRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/health", healthRoutes);
app.use("/api/health", healthRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use((req, res, next) => {
  logger.warn(`Unhandled route: ${req.method} ${req.url}`);
  res.status(404).send("Route not found");
});

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use(errorMiddleware);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
server.listen(PORT, () =>
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