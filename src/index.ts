import express, { Request, Response } from "express";
import passport from "passport";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "../swagger"; // Your Swagger API specification JSON
import AppDataSource from "./config/db.config";
import "./config/passport.config"; // Passport strategies initialization
import { join } from "path";
import { mkdirSync } from "fs";
import cors from "cors";
import { createServer } from "http";
import { corsOptions } from "./config/cors.config";
import { initSocket } from "./socket/socket";
import config from "./config/env.config";
import { cacheInvalidationMiddleware } from "./middlewares/cacheInvalidation.middleware";
import logger from "./utils/logger";
import {
  globalErrorHandler,
  notFoundHandler,
} from "./middlewares/errorHandler.middleware";

// Route imports
import userRouter from "./routes/user.routes";
import categoryRoutes from "./routes/category.routes";
import cartRouter from "./routes/cart.routes";
import vendorRoutes from "./routes/vendor.routes";
import wishlistRoutes from "./routes/wishlist.routes";
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
import adminVendorsRouter from "./routes/admin/admin.vendors.routes";
import adminOrdersRouter from "./routes/admin/admin.orders.routes";
import adminUsersRouter from "./routes/admin/admin.users.routes";
import vendorProductsRouter from "./routes/vendor/vendor.products.routes";
import vendorOrdersRouter from "./routes/vendor/vendor.orders.routes";

// Utils for scheduled background tasks
import {
  orderCleanUp,
  removeUnverifiedVendors,
  startOrderCleanupJob,
  tokenCleanUp,
} from "./utils/cronjob.utils";
import paymentRouter from "./routes/payment.routes";
import promoRouter from "./routes/promo.routes";
import imageRouter from "./routes/image.routes";
import homecategoryRoutes from "./routes/home.category.routes";
import notificationRoutes from "./routes/notification.routes";
import commissionRoutes from "./routes/commission.routes";
import checkoutRouter from "./routes/mobile.checkout.routes";
import { updateAllProductPrices } from "./scripts/update.product";
import userProfileRouter from "./routes/product.recommend.routes";
import productRecommendRouter from "./routes/product.recommend.routes";
import deliveryRouter from "./routes/delivery.routes";
import deliveryAdminRouter from "./routes/delivery.admin.routes";
import deliveryRiderRouter from "./routes/delivery.rider.routes";

// Create uploads folder if it doesn't exist to store uploaded files
const uploadDir = join(__dirname, "uploads");
mkdirSync(uploadDir, { recursive: true }); // recursive:true ensures parent dirs are created if needed

// Initialize Express app
const app = express();

// Create HTTP server early so process-level hooks can reference it for graceful shutdown
const server = createServer(app);

// ── Process-level safety net ──────────────────────────────────────────────────
// Must be registered before any async code runs.

process.on("uncaughtException", (error: Error) => {
  logger.error("UNCAUGHT EXCEPTION — shutting down", {
    name: error.name,
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("UNHANDLED REJECTION — shutting down", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  server.close(() => process.exit(1));
  // Force exit if graceful close hangs
  setTimeout(() => process.exit(1), 10_000).unref();
});

app.use(cors(corsOptions));

// Middleware to parse JSON request bodies
app.use(express.json());

// Middleware to parse URL-encoded request bodies (form submissions)
app.use(express.urlencoded({ extended: true }));

// Middleware to parse cookies
app.use(cookieParser());

// Initialize Passport for authentication middleware
app.use(passport.initialize());

app.use(
  cacheInvalidationMiddleware([
    {
      matchPrefix: "/api/categories",
      invalidatePrefixes: ["/api/categories", "/api/product", "/api/homepage"],
    },
    {
      matchPrefix: "/api/product",
      invalidatePrefixes: ["/api/product", "/api/categories", "/api/homepage"],
    },
    {
      matchPrefix: "/api/homepage",
      invalidatePrefixes: ["/api/homepage"],
    },
  ]),
);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});
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
app.use("/api/admin/vendors", adminVendorsRouter);
app.use("/api/admin/orders", adminOrdersRouter);
app.use("/api/admin/users", adminUsersRouter);

// admin delivery
app.use("/api/admin/delivery", deliveryAdminRouter);
// rider delivery
app.use("/api/rider/delivery", deliveryRiderRouter);

app.use("/api/vendor/dashboard", vendorDashBoardRouter);
app.use("/api/vendor/products", vendorProductsRouter);
app.use("/api/vendor/orders", vendorOrdersRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/promo", promoRouter);
app.use("/api/image", imageRouter);
app.use("/api/home/category/section", homecategoryRoutes);
app.use("/api/notification", notificationRoutes);
app.use("/api/commission", commissionRoutes);
app.use("/api/checkout", checkoutRouter);
app.use("/api/profile", productRecommendRouter);

// old
app.use("/api/delivery", deliveryRouter);

// ── Catch-all for unknown routes + global error handler ───────────────────────
// These MUST come after all route registrations.
app.use(notFoundHandler);
app.use(globalErrorHandler);

const port = config.PORT;

// Initialize database connection
AppDataSource.initialize()
  .then(async () => {
    logger.info("Database connected");

    // Start background cron jobs for token and order cleanup
    tokenCleanUp();
    orderCleanUp();
    startOrderCleanupJob();
    removeUnverifiedVendors();
    // await updateAllProductPrices(AppDataSource)

    // Start Express + WebSocket server
    initSocket(server);
    server.listen(port, () => {
      logger.info(
        `Server running at http://localhost:${port} or https://leafletdv.onrender.com`,
      );
    });
  })
  .catch((error) => {
    logger.error("Failed to initialize database", { error });
    process.exit(1);
  });
