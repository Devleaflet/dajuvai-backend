import { CorsOptions } from "cors";

export const allowedOrigins = [
    "https://dajuvai-frontend-ykrq.vercel.app",
    "https://dajuvai.com",
    "http://localhost:5173",
    "https://dev.dajuvai.com",
    "https://5srbcmrc-5173.inc1.devtunnels.ms",
    "http://localhost:3000",
];

export const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, origin); // reflect the exact origin, never "*"
        } else {
            callback(new Error(`CORS: origin ${origin} not allowed`));
        }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
};
