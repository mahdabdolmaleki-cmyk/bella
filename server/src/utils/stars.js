// ──────────────────────────────────────────────────────────────────────────
// سیستم ستاره‌های وفاداری (جایگزین امتیاز قبلی) — v42
//
// هر محصول یک «امتیاز» دارد (در فرم محصول ثبت می‌شود). با هر خریدِ نشست،
// مجموع امتیاز اقلام به مشتری اضافه می‌شود. سطح ستاره از مجموع امتیاز و
// آستانه‌های قابل‌تنظیم توسط ادمین (`starsConfigJson` در تنظیمات) به دست می‌آید.
// مزایای هر ستاره تجمعی است (ستارهٔ بالاتر، مزایای قبلی را هم دارد).
// ──────────────────────────────────────────────────────────────────────────

export const DEFAULT_STARS = [
  { points: 1, title: "ستارهٔ ۱", desc: "با خرید اول", perks: [] },
  { points: 5, title: "ستارهٔ ۲", desc: "معادل خرید پنجم", perks: ["vipbox"] },
  { points: 8, title: "ستارهٔ ۳", desc: "معادل خرید هشتم", perks: ["freeship"] },
  { points: 11, title: "ستارهٔ ۴", desc: "معادل خرید یازدهم", perks: ["gift"] },
  {
    points: 15,
    title: "ستارهٔ ۵",
    desc: "ویژهٔ مشتریان همیشگی",
    perks: ["vipbox", "freeship", "gift", "discount"],
    discountPercent: 7,
  },
];

/** JSON تنظیمات ستاره‌ها → آرایه؛ در صورت خرابی، پیش‌فرض. */
export function parseStarsConfig(json) {
  try {
    const p = JSON.parse(json || "");
    if (Array.isArray(p) && p.length) return p;
  } catch {
    /* دادهٔ خراب — پیش‌فرض */
  }
  return DEFAULT_STARS;
}

/** سطح ستاره (۰ تا N) از مجموع امتیاز و آستانه‌ها. */
export function starLevelFor(points, config) {
  let level = 0;
  for (let i = 0; i < config.length; i++) {
    const need = Number(config[i]?.points);
    if (Number.isFinite(need) && points >= need) level = i + 1;
  }
  return level;
}

/** مزایای تجمعی یک سطح ستاره. */
export function starPerks(level, config) {
  // discountPercent و discountAmount هر دو پشتیبانی می‌شوند (تخفیف درصدی یا
  // مبلغی). چون مزایا تجمعی‌اند، بیشترین مقدارِ هر کدام در میان ستاره‌های
  // باز شده برنده است.
  const acc = { vipbox: false, freeship: false, gift: false, discountPercent: 0, discountAmount: 0 };
  for (let i = 0; i < level && i < config.length; i++) {
    const s = config[i] || {};
    const perks = Array.isArray(s.perks) ? s.perks : [];
    if (perks.includes("vipbox")) acc.vipbox = true;
    if (perks.includes("freeship")) acc.freeship = true;
    if (perks.includes("gift")) acc.gift = true;
    if (perks.includes("discount")) {
      acc.discountPercent = Math.max(acc.discountPercent, Math.min(90, Math.max(0, Number(s.discountPercent) || 0)));
      acc.discountAmount = Math.max(acc.discountAmount, Math.max(0, Number(s.discountAmount) || 0));
    }
  }
  return acc;
}

/**
 * منبع هر مزیت: اولین ستاره‌ای (پایین‌ترین سطح) که آن مزیت را باز کرده،
 * در محدودهٔ سطحِ رسیده. برای نمایشِ دقیقِ «از مزایای ستارهٔ N» در فاکتور.
 * خروجی: { vipbox: { star: 2, title: "ستارهٔ ۲" }, freeship: {...}, ... }
 */
export function starPerkSources(level, config) {
  const src = {};
  for (let i = 0; i < level && i < config.length; i++) {
    const s = config[i] || {};
    const perks = Array.isArray(s.perks) ? s.perks : [];
    const starNo = i + 1;
    const title = s.title || `ستارهٔ ${starNo}`;
    for (const key of ["vipbox", "freeship", "gift", "discount"]) {
      if (perks.includes(key) && !src[key]) src[key] = { star: starNo, title };
    }
  }
  return src;
}
