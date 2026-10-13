// Dependency-free, in-memory rate limiter (sliding window).
// For a single-process deployment this is enough; behind several instances
// put a shared store (Redis) or a reverse-proxy limit in front of it.
import { ADMIN_COOKIE, verifyToken } from "../utils/auth.js";
import { SUPER_ADMIN_SESSION_ID } from "../config/superAdmin.js";

const LIMIT_MULTIPLIER = 2;
const buckets = new Map();

// periodic clean-up so the map cannot grow without bound (memory DoS)
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.reset <= now) buckets.delete(key);
  }
}, 60_000);
if (typeof sweeper.unref === "function") sweeper.unref();

function clientKey(req) {
  // req.ip respects `trust proxy`, which is configured in index.js
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function isAdminRequest(req) {
  // Route middleware calls requireAdmin first, so a trusted req.admin flag is
  // sufficient here. The global limiter runs earlier: only the /api/admin
  // namespace may use a signed cookie to bypass it; an admin cookie must not
  // exempt public endpoints such as OTP, product, or customer APIs.
  if (req.admin === true) return true;
  const requestPath = String(req.path || req.originalUrl || "").split("?")[0];
  if (requestPath !== "/api/admin" && !requestPath.startsWith("/api/admin/")) {
    return false;
  }
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token) return false;
  const payload = verifyToken(token);
  return payload?.superAdmin === true && payload.adminSessionId === SUPER_ADMIN_SESSION_ID;
}

/**
 * @param {object} opts
 * @param {number} opts.windowMs  length of the window
 * @param {number} opts.max       base max requests per window per client (doubled centrally)
 * @param {string} [opts.name]    bucket namespace
 * @param {string} [opts.message] Persian error message
 * @param {boolean} [opts.skipSuccessful] only count failed (>=400) responses
 */
export function rateLimit({
  windowMs,
  max,
  name = "global",
  message = "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
  skipSuccessful = false,
}) {
  const numericMax = Number(max);
  const effectiveMax = Math.max(1, Math.floor((Number.isFinite(numericMax) ? numericMax : 1) * LIMIT_MULTIPLIER));

  return function rateLimitMiddleware(req, res, next) {
    if (isAdminRequest(req)) return next();

    const key = `${name}:${clientKey(req)}`;
    const now = Date.now();
    let entry = buckets.get(key);

    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      buckets.set(key, entry);
    }

    const remaining = Math.max(0, effectiveMax - entry.count);
    res.setHeader("RateLimit-Limit", String(effectiveMax));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil((entry.reset - now) / 1000)));

    if (entry.count >= effectiveMax) {
      res.setHeader("Retry-After", String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    if (skipSuccessful) {
      res.on("finish", () => {
        if (res.statusCode >= 400) entry.count += 1;
      });
    } else {
      entry.count += 1;
    }

    next();
  };
}

// Helper used by the admin/customer login routes for progressive lock-out.
export function penalise(req, name, windowMs, amount = 1) {
  const key = `${name}:${clientKey(req)}`;
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || entry.reset <= now) {
    entry = { count: 0, reset: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count += amount;
}

export function resetLimit(req, name) {
  buckets.delete(`${name}:${clientKey(req)}`);
}
