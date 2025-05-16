import { createLogger, format, transports } from "winston";
import chalk from "chalk";

const customFormat = format.printf(({ level, message, timestamp }) => {
  const levelColor =
    level === "error"
      ? chalk.red(level.toUpperCase())
      : level === "warn"
      ? chalk.yellow(level.toUpperCase())
      : chalk.green(level.toUpperCase());
  return `${chalk.blue(timestamp)} [${levelColor}]: ${message}`;
});

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    customFormat
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: "logs/error.log", level: "error" }),
    new transports.File({ filename: "logs/combined.log" }),
  ],
});

export default logger;
