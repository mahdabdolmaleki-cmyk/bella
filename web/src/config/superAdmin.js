/**
 * SUPER ADMIN (root owner) configuration.
 *
 * The phone number below is HARD-CODED ON PURPOSE.
 * It is the only number that can receive an OTP for the root admin account,
 * it can never be changed from the admin panel, from the API, from the
 * database, or from an environment variable. Changing it requires editing
 * this file and re-deploying the server.
 *
 * If an attacker gets full write access to MongoDB they still cannot take
 * over the root account, because the recovery channel lives in the source code.
 */

// ⚠️  CHANGE THIS ONE LINE TO YOUR OWN MOBILE NUMBER BEFORE DEPLOYING.
// NOTE: the previous placeholder (09120000000) was the SAME number as one of
// the demo customers created by `npm run seed`, which meant the seeded customer
// was treated as the root owner. It is now a number the seed script never uses.
const RAW_SUPER_ADMIN_PHONE = "09000000000";

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

export const SUPER_ADMIN_PHONE = Object.freeze(
  normalizePhone(RAW_SUPER_ADMIN_PHONE) || ""
);

if (!SUPER_ADMIN_PHONE) {
  console.warn(
    "⚠️  SUPER_ADMIN_PHONE in src/config/superAdmin.js is not a valid 09xxxxxxxxx number — root admin OTP recovery is disabled."
  );
}

/** Masked form for the UI: 0912***4567 */
export function maskPhone(phone) {
  const p = normalizePhone(phone);
  if (!p) return "";
  return `${p.slice(0, 4)}***${p.slice(-4)}`;
}

export function isSuperAdminPhone(value) {
  const p = normalizePhone(value);
  return Boolean(p && SUPER_ADMIN_PHONE && p === SUPER_ADMIN_PHONE);
}
