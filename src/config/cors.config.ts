import { CorsOptions } from "cors";

export const allowedOrigins = [
    "https://dajuvai-frontend-ykrq.vercel.app",
    "https://dajuvai.com",
    "http://localhost:5173",
    "https://dev.dajuvai.com",
    "https://5srbcmrc-5173.inc1.devtunnels.ms",
    "http://localhost:3000",
    "*",
];

export const corsOptions: CorsOptions = {
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
};
