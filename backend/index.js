import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import logger from "./libs/logger.js";
import bodyParser from "body-parser";
import swaggerUi from "swagger-ui-express";
import swaggerDocs from "./config/swagger.js";
import cors from "cors";

dotenv.config();

const app = express();

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true })); // for form-data payloads
app.use(bodyParser.json()); // For JSON payloads
app.use(morgan("dev"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

const allowedOrigins = [];

app.use(
  cors({
    origin: allowedOrigins,
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

app.get("/", (req, res) => res.status(200).send("OK"));


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
logger.info("Swagger Docs Available At http://localhost:8080/api-docs");

function shutdown(signal) {
  console.log(`Received ${signal}. Closing server...`);
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
}
