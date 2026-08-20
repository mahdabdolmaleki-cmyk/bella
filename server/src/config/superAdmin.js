import crypto from "node:crypto";

/**
 * The application has exactly one administrator identity. Its two login
 * identifiers come exclusively from deployment environment variables and are
 * never stored in MongoDB or editable through an API/admin screen.
 *
 * Required in production:
 *   SUPER_ADMIN_PHONE=09121234567
 *   SUPER_ADMIN_EMAIL=owner@example.com
 */

/**
 * Normalises any Iranian mobile format to the canonical 09xxxxxxxxx form:
 * +989121234567 / 00989121234567 / 9121234567 / ۰۹۱۲۱۲۳۴۵۶۷ -> 09121234567
 */
export function normalizePhone(value) {
  if (value === undefined || value === null || typeof value === "object") return null;
  let s = String(value).trim();
  // Persian / Arabic-Indic digits -> ASCII
  s = s.replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  s = s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[^0-9+]/g, "");
  if (s.startsWith("+98")) s = `0${s.slice(3)}`;
  else if (s.startsWith("0098")) s = `0${s.slice(4)}`;
  else if (s.startsWith("98") && s.length === 12) s = `0${s.slice(2)}`;
  else if (s.startsWith("9") && s.length === 10) s = `0${s}`;
  return /^09\d{9}$/.test(s) ? s : null;
}

/** Normalises an e-mail to a trimmed lower-case form, or null when invalid. */
export function normalizeEmail(value) {
  if (value === undefined || value === null || typeof value === "object") return null;
  const s = String(value).trim().toLowerCase();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(s) ? s : null;
}

// No fallback literals on purpose: the owner must explicitly configure both.
// The ENV phone is deliberately stricter than a login input: deployments must
// use the single canonical 09xxxxxxxxx representation.
const rawSuperAdminPhone = String(process.env.SUPER_ADMIN_PHONE || "").trim();
export const SUPER_ADMIN_PHONE = /^09\d{9}$/.test(rawSuperAdminPhone)
  ? rawSuperAdminPhone
  : "";
export const SUPER_ADMIN_EMAIL = normalizeEmail(process.env.SUPER_ADMIN_EMAIL) || "";

const configErrors = [];
if (!SUPER_ADMIN_PHONE) configErrors.push("SUPER_ADMIN_PHONE");
if (!SUPER_ADMIN_EMAIL) configErrors.push("SUPER_ADMIN_EMAIL");
if (configErrors.length) {
  const message = `${configErrors.join(" و ")} تنظیم نشده یا نامعتبر است؛ ورود مدیر اصلی غیرفعال است.`;
  if (process.env.NODE_ENV === "production") throw new Error(message);
  console.warn(`⚠️  ${message}`);
}

/**
 * Admin cookies are bound to this non-secret digest. Changing either ENV value
 * invalidates every older admin session without a database lookup.
 */
export const SUPER_ADMIN_SESSION_ID = crypto
  .createHash("sha256")
  .update(`${SUPER_ADMIN_PHONE}\0${SUPER_ADMIN_EMAIL}`, "utf8")
  .digest("hex");

/** Masked form for the UI: 0912***4567 */
export function maskPhone(phone) {
  const p = normalizePhone(phone);
  if (!p) return "";
  return `${p.slice(0, 4)}***${p.slice(-4)}`;
}

export function isSuperAdminPhone(value) {
  const phone = normalizePhone(value);
  return Boolean(phone && SUPER_ADMIN_PHONE && phone === SUPER_ADMIN_PHONE);
}

export function isSuperAdminEmail(value) {
  const email = normalizeEmail(value);
  return Boolean(email && SUPER_ADMIN_EMAIL && email === SUPER_ADMIN_EMAIL);
}
