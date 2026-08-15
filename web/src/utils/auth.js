import crypto from "crypto";
import jwt from "jsonwebtoken";

const DEV_PLACEHOLDERS = new Set([
  "",
  "change-me-to-a-long-random-string",
  "dev-insecure-secret-change-me",
]);

function resolveSecret() {
  const fromEnv = process.env.JWT_SECRET || "";
  const isProd = process.env.NODE_ENV === "production";

  if (DEV_PLACEHOLDERS.has(fromEnv) || fromEnv.length < 32) {
    if (isProd) {
      // Never boot production with a guessable signing key.
      throw new Error(
        "JWT_SECRET is missing or too short. Set a random value of at least 32 characters."
      );
    }
    const generated = crypto.randomBytes(48).toString("hex");
    console.warn(
      "⚠️  JWT_SECRET is not set — using a random per-process secret (dev only). Sessions reset on restart."
    );
    return generated;
  }
  return fromEnv;
}

// Resolved once at start-up (after dotenv has run in index.js).
let cachedSecret = null;
function secret() {
  if (!cachedSecret) cachedSecret = resolveSecret();
  return cachedSecret;
}

function sessionDays() {
  const n = Number(process.env.SESSION_DAYS);
  return Number.isFinite(n) && n > 0 && n <= 90 ? n : 7;
}

export const ADMIN_COOKIE = "bella_admin";
export const USER_COOKIE = "bella_token";

// Admin sessions are deliberately much shorter than customer sessions:
// a stolen admin cookie used to stay valid for a full week.
export function adminSessionHours() {
  const n = Number(process.env.ADMIN_SESSION_HOURS);
  return Number.isFinite(n) && n >= 1 && n <= 72 ? n : 12;
}

export function signToken(payload, options = {}) {
  return jwt.sign(payload, secret(), {
    expiresIn: options.expiresIn || `${sessionDays()}d`,
    issuer: "bella-api",
    audience: "bella-web",
  });
}

export function verifyToken(token) {
  if (typeof token !== "string" || token.length > 4096) return null;
  try {
    return jwt.verify(token, secret(), {
      algorithms: ["HS256"],
      issuer: "bella-api",
      audience: "bella-web",
    });
  } catch {
    return null;
  }
}

// SameSite=Lax works for the Next.js rewrite proxy (same-origin for the
// browser). Set COOKIE_SAMESITE=none only when the API really is on another
// domain and served over HTTPS.
export function cookieOptions() {
  const prod = process.env.NODE_ENV === "production";
  const sameSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();
  const valid = ["lax", "strict", "none"].includes(sameSite) ? sameSite : "lax";
  return {
    httpOnly: true,
    secure: prod || valid === "none",
    sameSite: valid,
    maxAge: sessionDays() * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

export function adminCookieOptions() {
  const base = cookieOptions();
  return {
    ...base,
    // HARDENING: the admin panel is always same-origin, so Strict costs nothing
    // and removes the residual CSRF surface that SameSite=Lax leaves open.
    sameSite: base.sameSite === "none" ? "none" : "strict",
    maxAge: adminSessionHours() * 60 * 60 * 1000,
  };
}

export function clearCookieOptions() {
  const { maxAge, ...rest } = cookieOptions();
  return rest;
}

// Constant-time comparison so an attacker cannot time-probe the password.
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  const hashA = crypto.createHash("sha256").update(bufA).digest();
  const hashB = crypto.createHash("sha256").update(bufB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}
