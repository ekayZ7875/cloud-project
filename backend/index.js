import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import logger from "./libs/logger.js";
import bodyParser from "body-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import fileRoutes from "./routes/file.routes.js"
import folderRoutes from './routes/folder.routes.js'

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({extended:true}))
app.use(bodyParser.urlencoded({ extended: true })); // for form-data payloads
app.use(bodyParser.json()); // For JSON payloads
app.use(morgan("dev"));

const allowedOrigins = ["http://localhost:5173"];

app.use(
  cors({
    origin: allowedOrigins,
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

app.get("/", (req, res) => res.status(200).send("OK"));
app.use("/api/auth", authRoutes);
app.use('/api/files',fileRoutes)
app.use('/api/folder',folderRoutes)

app.use((req, res, next) => {
  logger.warn(`Unhandled route: ${req.method} ${req.url}`);
  res.status(404).send("Route not found");
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGUSR2", () => shutdown("SIGUSR2"));

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () =>
  logger.info(`Server running on port ${PORT}`)
);
logger.info("MORGAN ENABLED");

function shutdown(signal) {
  console.log(`Received ${signal}. Closing server...`);
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
}
