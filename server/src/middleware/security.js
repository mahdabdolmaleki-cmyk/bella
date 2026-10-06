// Dependency-free security middlewares (helmet / mongo-sanitize / hpp style).

// ---- 1. Security response headers -----------------------------------------
export function securityHeaders(req, res, next) {
  res.removeHeader("X-Powered-By");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // OWASP/MDN: disable the legacy (and exploitable) browser XSS auditor;
  // protection comes from the strict CSP below.
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  // The API only ever returns JSON or images, so a very strict CSP is safe.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

// ---- 2. NoSQL-injection / prototype-pollution sanitiser --------------------
const FORBIDDEN_KEY = /^\$|\./;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function scrub(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    // hard cap on array size to prevent payload-amplification DoS
    return value.slice(0, 200).map((v) => scrub(v, depth + 1));
  }
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key) || FORBIDDEN_KEY.test(key)) continue;
    out[key] = scrub(val, depth + 1);
  }
  return out;
}

// پارامترهایی که به‌طور مشروع چندمقداری‌اند: فیلترهای فروشگاه با کلید تکراری
// فرستاده می‌شوند (brand=آ&brand=ب). این‌ها فقط داخل $in (تطبیق دقیق رشته)
// استفاده می‌شوند و از نظر تزریق/آمپلیفیکیشن بی‌خطرند (scrub سقف ۲۰۰ عضو
// می‌گذارد و مسیر products هر کدام را به ۲۰ مورد با سقف طول محدود می‌کند).
const MULTI_VALUE_QUERY_KEYS = new Set([
  "brand",
  "scent",
  "concentration",
  "season",
  "size",
]);

export function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === "object") req.body = scrub(req.body);
  if (req.params && typeof req.params === "object") req.params = scrub(req.params);
  if (req.query && typeof req.query === "object") {
    // HPP protection: ?a=1&a=2 arrives as an array — keep only the last value.
    // BUG FIX: کلیدهای چندمقداریِ مجاز (فیلتر فروشگاه) از این قاعده مستثنا
    // شدند؛ قبلاً «برند=آ&برند=ب» فقط آخرین برند را نگه می‌داشت و انتخاب
    // هم‌زمان چند برند/رایحه/فصل عملاً کار نمی‌کرد.
    const cleaned = scrub(req.query);
    for (const [k, v] of Object.entries(cleaned)) {
      if (Array.isArray(v) && !MULTI_VALUE_QUERY_KEYS.has(k)) cleaned[k] = v[v.length - 1];
    }
    // req.query is a getter in Express 5 — defineProperty keeps both versions happy
    try {
      req.query = cleaned;
    } catch {
      Object.defineProperty(req, "query", { value: cleaned, configurable: true });
    }
  }
  next();
}

// ---- 3. CSRF: origin / referer check on state-changing requests ------------
// Cookies are SameSite=Lax by default, this is the second line of defence.
export function originGuard(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return function originGuardMiddleware(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

    const origin = req.headers.origin;
    if (origin) {
      if (allowed.has(origin.replace(/\/$/, ""))) return next();
      return res.status(403).json({ error: "درخواست از مبدأ نامعتبر رد شد." });
    }

    // No Origin header. Browsers ALWAYS send one on cross-site POSTs, but the
    // Next.js rewrite proxy strips it, so fall back to Referer and finally to
    // the custom header that the frontend always sets (see web/src/lib/api.ts).
    const referer = req.headers.referer;
    if (referer) {
      try {
        const o = new URL(referer).origin;
        if (allowed.has(o)) return next();
      } catch {
        /* malformed referer -> treated as missing */
      }
    }
    // Neither header present: this is a server-to-server call (the Next.js
    // rewrite proxy, curl, a health check). A browser CSRF attempt always
    // carries at least one of them, so letting these through is safe and stops
    // the guard from breaking the proxied frontend.
    return next();
  };
}
