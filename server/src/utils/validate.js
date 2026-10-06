// Small, dependency-free validation / normalisation helpers.
// Every value coming from a client is forced to a primitive first so that
// object payloads such as {"$ne": null} can never reach Mongo.

/**
 * کاراکترهای نامرئی که رندر فارسی را به‌هم می‌ریزند.
 *
 * متن‌های کپی‌شده از Word / تلگرام / PDF اغلب نویسه‌های کنترلیِ دوجهته
 * (LRM، RLM، LRE، RLE، PDF، LRI…PDI)، فاصلهٔ عرض صفر (ZWSP) و soft hyphen
 * دارند. این نویسه‌ها دیده نمی‌شوند اما ترتیب نمایش کلمات و اتصال حروف را
 * خراب می‌کنند — مثلاً جمله‌های اولِ آموزش/توضیحات به‌هم ریخته دیده می‌شوند.
 * ZWJ (نیم‌فاصله، U+200C) عمداً حذف نمی‌شود چون بخشی از املای درست فارسی است.
 */
const INVISIBLE_CHARS =
  /[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c\ufeff\u00ad]/g;

export function stripInvisible(value) {
  return typeof value === "string" ? value.replace(INVISIBLE_CHARS, "") : value;
}

export function str(value, { max = 500, trim = true } = {}) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return ""; // reject objects/arrays outright
  // BUG FIX: ابتدا نویسه‌های نامرئی دوجهته حذف می‌شوند تا متن کپی‌شده از
  // Word/تلگرام/PDF در سایت به‌هم‌ریخته رندر نشود.
  let out = stripInvisible(String(value));
  if (trim) out = out.trim();
  // strip control characters (except newline / tab) to avoid log injection
  out = out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  // چند فاصله/تب پی‌درپی (جاافتاده از کپی) به یک فاصلهٔ دوتایی فشرده می‌شود
  out = out.replace(/[ \t]{3,}/g, "  ");
  return out.slice(0, max);
}

export function num(value, { min = -Infinity, max = Infinity, fallback = null, clamp = true } = {}) {
  if (typeof value === "object" && value !== null) return fallback; // {"$gt":0}
  if (typeof value === "string" && value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  // With clamp:false an out-of-range value is REJECTED instead of quietly
  // becoming the nearest bound, so a price of -50 no longer turns into 0.
  if (!clamp && (n < min || n > max)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function int(value, opts = {}) {
  const n = num(value, opts);
  return n === null ? null : Math.trunc(n);
}

export function bool(value) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  return false;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
export function isEmail(value) {
  const s = str(value, { max: 254 });
  return EMAIL_RE.test(s) ? s.toLowerCase() : null;
}

// Iranian mobile / landline, quite permissive but bounded.
const PHONE_RE = /^[0-9+()\-\s]{7,20}$/;
export function isPhone(value) {
  const s = str(value, { max: 20 });
  return PHONE_RE.test(s) ? s : null;
}

// Iranian postal code: exactly 10 digits. The official format forbids 0 as the
// first digit and 2 as the fifth, and rejects a run of identical digits.
export function isPostalCode(value) {
  const raw = str(value, { max: 20 })
    // Persian / Arabic-Indic digits -> latin, then drop separators.
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(raw)) return null;
  if (/^(\d)\1{9}$/.test(raw)) return null;
  if (raw[0] === "0" || raw[4] === "2") return null;
  return raw;
}

// Hex colour used for the bottle glass/liquid pickers.
export function isHexColor(value, fallback = "#000000") {
  const s = str(value, { max: 9 });
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}

// Only allow relative upload paths or https URLs as product images —
// blocks javascript:, data: and other XSS-capable schemes.
export function safeImage(value) {
  const s = str(value, { max: 300 });
  if (!s) return null;
  if (/^\/uploads\/products\/[A-Za-z0-9._-]+$/.test(s)) return s;
  if (/^https:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+$/.test(s)) return s;
  return null;
}

export function passwordIssue(value) {
  const s = typeof value === "string" ? value : "";
  if (s.length < 8) return "رمز عبور باید حداقل ۸ کاراکتر باشد.";
  if (s.length > 128) return "رمز عبور بیش از حد طولانی است.";
  if (!/[a-zA-Z\u0600-\u06FF]/.test(s) || !/[0-9]/.test(s))
    return "رمز عبور باید شامل حروف و حداقل یک عدد باشد.";
  return null;
}

/**
 * Validates a postal address. Returns a Persian error message, or "" when the
 * value is acceptable.
 *
 * This exists because the profile endpoint used to accept ANY string up to 500
 * characters, so a browser password manager auto-filling the address textarea
 * could silently store a password there — while checkout (which requires 10+
 * characters) would then reject the very same saved address.
 */
export function addressIssue(value) {
  const address = str(value, { max: 500 });
  if (!address) return "نشانی را وارد کنید.";
  if (address.length < 10) return "نشانی باید حداقل ۱۰ کاراکتر و کامل باشد.";
  // A real address is never a single token. This is what rejects a stray
  // password or username dropped into the field by autofill.
  if (!/\s/.test(address)) {
    return "نشانی کامل نیست. خیابان، کوچه و پلاک را بنویسید.";
  }
  // Must contain letters; "1234 5678" is not an address either.
  if (!/[\u0600-\u06FFa-zA-Z]{3,}/.test(address)) {
    return "نشانی معتبر نیست.";
  }
  return "";
}

