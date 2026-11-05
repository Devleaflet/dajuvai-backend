import { CorsOptions } from "cors";
import { ForbiddenError } from "../errors";

const productionOrigins = [
  "https://dajuvai.com",
  "https://dev.dajuvai.com",
  "https://dajuvai-frontend-ykrq.vercel.app",
  "https://project-f6q8p.vercel.app",
  "https://dajuvai-nextjs-frontend.vercel.app",
];

/**
 * Local and tunnel hosts are for development only: a credentialed CORS grant
 * to a tunnel or a localhost page has no place on the production API.
 */
const developmentOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "https://5srbcmrc-5173.inc1.devtunnels.ms",
  "https://lens-boneless-able.ngrok-free.dev",
];

export const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? productionOrigins
    : [...productionOrigins, ...developmentOrigins];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      // Server-to-server calls have no Origin header. Let them continue
      // without adding browser CORS headers.
      return callback(null, false);
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, origin);
    } else {
      // A 403, not a bare Error: that surfaced as a 500 to every foreign origin.
      callback(new ForbiddenError(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
};
