import { CorsOptions } from "cors";

export const allowedOrigins = [
  "https://dajuvai-frontend-ykrq.vercel.app",
  "https://dajuvai.com",
  "http://localhost:5173",
  "https://dev.dajuvai.com",
  "https://5srbcmrc-5173.inc1.devtunnels.ms",
  "http://localhost:3000",
  "http://localhost:3001",
  "https://project-f6q8p.vercel.app",
  "https://dajuvai-nextjs-frontend.vercel.app",
  "https://lens-boneless-able.ngrok-free.dev",
];

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
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
};
