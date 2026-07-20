import { CorsOptions } from "cors";
import config from "./env.config";

export const allowedOrigins = [
    "https://dajuvai-frontend-ykrq.vercel.app",
    "https://dajuvai.com",
    "http://localhost:5173",
    "https://dev.dajuvai.com",
    "https://5srbcmrc-5173.inc1.devtunnels.ms",
    "http://localhost:3000",
    "https://project-f6q8p.vercel.app",
    "https://dajuvai-nextjs-frontend.vercel.app"
];

export const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        if (!origin) {
            if (config.NODE_ENV === "production") {
                return callback(new Error("CORS: No origin header in production"));
            }
            return callback(null, true);
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
