import "dotenv/config"; // BUG FIX: env vars were never loaded in the server entry
import express from "express";
import compression from "compression";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { connectDB } from "./config/db.js";
import { startStaleOrderSweeper } from "./jobs/staleOrders.js";
import { startLogRetention } from "./utils/fileLog.js";
import { securityHeaders, sanitizeRequest, originGuard } from "./middleware/security.js";
import { rateLimit } from "./middleware/rateLimit.js";
import productsRouter from "./routes/products.js";
import authRouter from "./routes/authUser.js";
import adminRouter from "./routes/admin.js";
import ordersRouter from "./routes/orders.js";
import contactRouter from "./routes/contact.js";
import settingsRouter from "./routes/settings.js";
import otpRouter from "./routes/otp.js";
import paymentRouter from "./routes/payment.js";
import shippingRouter from "./routes/shipping.js";
import reviewsRouter from "./routes/reviews.js";
import trackRouter from "./routes/track.js";
import accountRouter from "./routes/account.js";
import adminExtrasRouter from "./routes/adminExtras.js";
import notificationsRouter from "./routes/notifications.js";
import backupRouter from "./routes/backup.js";
import tutorialsRouter from "./routes/tutorials.js";
import adminTutorialsRouter from "./routes/adminTutorials.js";
import {
  currentExclusiveOperation,
  isMaintenanceInProgress,
} from "./utils/restoreState.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// BUG FIX: default was 5000 while .env.example and the Next.js proxy use 4000.
const port = Number(process.env.PORT) || 4000;
const isProd = process.env.NODE_ENV === "production";

// Needed so req.ip (and therefore rate limiting) is correct behind nginx/Vercel.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
app.disable("x-powered-by");
app.disable("etag");

// ---- CORS: strict allow-list instead of reflecting any origin --------------
// `origin: true` + `credentials: true` echoed back ANY site's origin, which let
// a malicious page read authenticated responses. Only known origins now pass.
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / same-origin proxy
      if (allowedOrigins.includes(origin.replace(/\/$/, ""))) return cb(null, true);
      return cb(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
    maxAge: 600,
  })
);

app.use(securityHeaders);
// gzip/brotli every JSON response (admin lists were sent uncompressed).
app.use(compression());
// Explicit body-size limits: an unbounded body is a cheap DoS vector.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
app.use(sanitizeRequest);
app.use(originGuard(allowedOrigins));
app.use(morgan(isProd ? "combined" : "dev"));

// ---- Global rate limit (every client, every route) -------------------------
app.use(
  rateLimit({
    name: "global",
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 300), // 300 requests / 15 min
  })
);

app.get("/health", (_req, res) => {
  const operation = currentExclusiveOperation();
  res.status(operation ? 503 : 200).json({
    ok: !operation,
    maintenance: operation,
    restoring: operation === "restore",
    service: "bella-server",
  });
});

// Full backup snapshots and restores are exclusive. Their own request passed
// this middleware before acquiring the lock; every concurrent request waits.
app.use((req, res, next) => {
  if (!isMaintenanceInProgress()) return next();
  return res.status(503).json({
    error: "عملیات پشتیبان‌گیری در حال انجام است؛ چند لحظه دیگر دوباره تلاش کنید.",
    maintenance: currentExclusiveOperation(),
  });
});

// ---- Static uploads --------------------------------------------------------
const uploadsRoot = path.join(__dirname, "..", "uploads");
fs.mkdirSync(path.join(uploadsRoot, "products"), { recursive: true });

app.use(
  "/uploads",
  rateLimit({ name: "uploads", windowMs: 60 * 1000, max: 240 }),
  express.static(uploadsRoot, {
    index: false,
    dotfiles: "deny",
    // Upload filenames are random and never overwritten, so they are safe to
    // cache forever. "7d" forced a revalidation every week for nothing.
    maxAge: "365d",
    immutable: true,
    setHeaders(res) {
      // Stop a crafted "image" from being sniffed and executed as HTML/JS.
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    },
  })
);

app.use("/api/products", productsRouter);
app.use("/api/auth", authRouter);
// adminExtras is mounted FIRST so /api/admin/reviews and /api/admin/stats are
// handled there; anything it does not match falls through to adminRouter.
// It enforces requireAdmin itself — never rely on mount order for auth.
// Customer announcements live on their own prefix so their blanket admin
// guard can never intercept /api/admin/login.
// Mounted BEFORE the generic /api/admin routers so the owner-only guard inside
// it always wins; otherwise a broader admin route could shadow these paths.
app.use("/api/admin/backup", backupRouter);
app.use("/api/admin/notifications", notificationsRouter);
app.use("/api/admin", adminTutorialsRouter);
app.use("/api/admin", adminExtrasRouter);
app.use("/api/admin", adminRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/contact", contactRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/otp", otpRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/shipping", shippingRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/tutorials", tutorialsRouter);
app.use("/api/account", accountRouter);
app.use("/api/track", trackRouter);

// ---- 404 (was missing: unknown routes hung or returned HTML) ---------------
app.use((_req, res) => {
  res.status(404).json({ error: "مسیر موردنظر پیدا نشد." });
});

// ---- Central error handler -------------------------------------------------
// Never leaks stack traces or internal messages to the client.
app.use((err, _req, res, _next) => {
  if (err?.name === "MulterError") {
    const msg =
      err.code === "LIMIT_FILE_SIZE"
        ? "حجم فایل نباید بیشتر از ۵ مگابایت باشد."
        : "آپلود فایل نامعتبر است.";
    return res.status(400).json({ error: msg });
  }
  if (err?.message === "Origin not allowed by CORS") {
    return res.status(403).json({ error: "دسترسی از این دامنه مجاز نیست." });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "حجم درخواست بیش از حد مجاز است." });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "قالب داده‌های ارسالی نامعتبر است." });
  }
  if (err?.name === "ValidationError") {
    return res.status(400).json({ error: "داده‌های ارسالی معتبر نیستند." });
  }
  if (err?.name === "CastError") {
    return res.status(400).json({ error: "شناسه نامعتبر است." });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: "این رکورد قبلاً ثبت شده است." });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "خطای داخلی سرور." });
});

async function start() {
  try {
    await connectDB(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bella");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    // In production a database-less API only returns 500s — fail fast instead.
    if (isProd) process.exit(1);
  }

  // Releases stock reserved by orders that never reached the gateway.
  startStaleOrderSweeper();
  // Deletes activity log files older than LOG_RETENTION_DAYS (default 30).
  startLogRetention();

  const server = app.listen(port, () => {
    console.log(`🚀 Bella server listening on http://localhost:${port}`);
  });

  // Slow-loris / socket exhaustion protection.
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 15_000;

  const shutdown = (signal) => {
    console.log(`\n${signal} received — shutting down gracefully…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
  });
}

start();
export default app;
