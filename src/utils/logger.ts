import { createLogger, format, transports } from "winston";
import config from "../config/env.config";

const { combine, timestamp, errors, json, colorize, simple } = format;

const isProduction = config.NODE_ENV === "production";

const logger = createLogger({
    level: isProduction ? "warn" : "debug",
    format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true }), // ensures stack is serialized into the log object
        json(),
    ),
    transports: [
        new transports.Console({
            format: isProduction ? json() : combine(colorize(), simple()),
        }),
        // new transports.File({ filename: "logs/error.log", level: "error" }),
        // new transports.File({ filename: "logs/combined.log" }),
    ],
});

export default logger;
