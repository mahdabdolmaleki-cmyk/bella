// ---------------------------------------------------------------------------
// کدهای تخفیف (v40)
//
// لیست کدها در تنظیمات سایت به‌صورت JSON ذخیره می‌شود تا ادمین بتواند از
// پنل «تنظیمات سایت» بدون مهاجرت دیتابیس کد اضافه/حذف کند:
//   [{"code":"BELLA15","percent":15,"until":"2026-11-01"}]
//   [{"code":"HEDAYE50","amount":500000,"until":"2026-11-01"}]   (v41: مبلغی)
// `percent` یا `amount` (تومان)؛ اگر هر دو باشند مبلغی برندهٔ بزرگ‌تری است.
// `until` تاریخ میلادیِ ذخیره‌شده (در پنل به شمسی ویرایش می‌شود) — خالی یعنی
// بدون انقضا؛ در غیر این صورت تا پایان آن روز معتبر است.
// ---------------------------------------------------------------------------

const CODE_RE = /^[A-Z0-9\u0600-\u06FF][A-Z0-9\u0600-\u06FF_-]{1,23}$/;

export function normalizeCouponCode(raw) {
  return String(raw ?? "").trim().toUpperCase().slice(0, 24);
}

export function parseCouponList(json) {
  let arr;
  try {
    arr = JSON.parse(String(json || "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c) => ({
      code: normalizeCouponCode(c?.code),
      percent: Math.min(90, Math.max(0, Math.round(Number(c?.percent) || 0))),
      amount: Math.max(0, Math.round(Number(c?.amount) || 0)),
      until: /^\d{4}-\d{2}-\d{2}$/.test(String(c?.until ?? "")) ? String(c.until) : "",
    }))
    .filter((c) => CODE_RE.test(c.code) && (c.percent > 0 || c.amount > 0));
}

export function couponExpired(until, now = new Date()) {
  if (!until) return false;
  const end = new Date(`${until}T23:59:59`);
  return !(Number.isFinite(end.getTime()) && end.getTime() > now.getTime());
}

/** -> {coupon} | {reason:"empty"|"notfound"|"expired"} */
export function findCoupon(list, rawCode, now = new Date()) {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { reason: "empty" };
  const coupon = list.find((c) => c.code === code);
  if (!coupon) return { reason: "notfound" };
  if (couponExpired(coupon.until, now)) return { reason: "expired" };
  return { coupon };
}

/** مبلغ تخفیفِ یک کوپن روی جمع کالا — درصدی یا مبلغی (تومان). */
export function couponAmount(subtotal, coupon) {
  if (coupon?.amount > 0) return Math.min(subtotal, coupon.amount);
  return Math.min(subtotal, Math.round((subtotal * (coupon?.percent || 0)) / 100));
}
