import express, { Request, Response } from "express";
import { config } from "dotenv";
import passport from "passport";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "../swagger"; // Your Swagger API specification JSON
import AppDataSource from "./config/db.config";
import "./config/passport.config"; // Passport strategies initialization
import { join } from "path";
import { mkdirSync } from "fs";
import cors, { CorsOptions } from "cors";

// Route imports
import userRouter from "./routes/user.routes";
import categoryRoutes from "./routes/category.routes";
import cartRouter from "./routes/cart.routes";
import vendorRoutes from "./routes/vendor.routes";
import wishlistRoutes from './routes/wishlist.routes';
import contactRoutes from "./routes/contact.routes";
import dealRoutes from "./routes/deal.routes";
import reviewRoutes from "./routes/review.routes";
import bannerRoutes from "./routes/banner.routes";
import orderRoutes from "./routes/order.routes";
import districtRoutes from "./routes/district.routes";
import homepageRoutes from "./routes/homepage.routes";
import productRouter from "./routes/product.routes";
import adminDashboardRouter from "./routes/admin.dashboard.routes";
import vendorDashBoardRouter from "./routes/vendor.dashboard.routes";

// Utils for scheduled background tasks
import { orderCleanUp, tokenCleanUp } from "./utils/cronjob.utils";
import paymentRouter from "./routes/payment.routes";
import promoRouter from "./routes/promo.routes";
import imageRouter from "./routes/image.routes";

// Create uploads folder if it doesn't exist to store uploaded files
const uploadDir = join(__dirname, 'uploads');
mkdirSync(uploadDir, { recursive: true }); // recursive:true ensures parent dirs are created if needed

// Initialize Express app
const app = express();

// Load environment variables from .env file
config();

const allowedOrigins = [
    'https://dajuvai-frontend-ykrq.vercel.app',
    'https://dajuvai.com',
    "http://localhost:5173",
    'https://dev.dajuvai.com'
]

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
}))



// Middleware to parse JSON request bodies
app.use(express.json());

// Middleware to parse URL-encoded request bodies (form submissions)
app.use(express.urlencoded({ extended: true }));

// Middleware to parse cookies
app.use(cookieParser());

// Initialize Passport for authentication middleware
app.use(passport.initialize());

// Setup Swagger UI for API documentation at /docs route
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/auth", userRouter);
app.use("/api/categories", categoryRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/cart", cartRouter);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/deal", dealRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/district", districtRoutes);
app.use("/api/homepage", homepageRoutes);
app.use("/api/product", productRouter);
app.use("/api/admin/dashboard", adminDashboardRouter);
app.use("/api/vendor/dashboard", vendorDashBoardRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/promo", promoRouter);
app.use("/api/image", imageRouter);

const port = process.env.PORT || 4000;

// Initialize database connection
AppDataSource.initialize()
    .then(() => {
        console.log("Database connected");

        // Start background cron jobs for token and order cleanup
        tokenCleanUp();
        orderCleanUp();

        // Start Express server
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port} or https://leafletdv.onrender.com`);
        });
    })
    .catch((error) => {
        // Log any errors during DB connection setup
        console.error("Error during Data Source initialization", error);
    });
