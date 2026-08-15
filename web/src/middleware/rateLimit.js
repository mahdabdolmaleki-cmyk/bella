// Dependency-free, in-memory rate limiter (sliding window).
// For a single-process deployment this is enough; behind several instances
// put a shared store (Redis) or a reverse-proxy limit in front of it.

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

/**
 * @param {object} opts
 * @param {number} opts.windowMs  length of the window
 * @param {number} opts.max       max requests per window per client
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
  return function rateLimitMiddleware(req, res, next) {
    const key = `${name}:${clientKey(req)}`;
    const now = Date.now();
    let entry = buckets.get(key);

    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      buckets.set(key, entry);
    }

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil((entry.reset - now) / 1000)));

    if (entry.count >= max) {
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
