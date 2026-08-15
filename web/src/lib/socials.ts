// کانال‌های اجتماعی صفحهٔ تماس — کاملاً قابل ویرایش توسط مدیر.
//
// مدل ذهنی: مدیر یک ردیف می‌سازد (نام + لینک + آیکن)؛ رنگ از خود آیکن
// می‌آید تا لازم نباشد کسی کد رنگ وارد کند، ولی اگر خواست می‌تواند عوضش کند.

// v32: فهرست عمداً کوتاه شد و فقط شش پیام‌رسانی ماند که مخاطب ایرانی
// واقعاً از آن‌ها استفاده می‌کند.
export type SocialIconKey =
  | "telegram"
  | "instagram"
  | "rubika"
  | "whatsapp"
  | "bale"
  | "eitaa";

export type SocialLink = {
  /** متن زیر آیکن، مثلاً «اینستاگرام». */
  name: string;
  /** نشانی کامل یا mailto:/tel: */
  href: string;
  icon: SocialIconKey;
  /** رنگ دایرهٔ آیکن (CSS color). خالی = رنگ پیش‌فرض همان شبکه. */
  color: string;
};

export const SOCIAL_ICON_LABELS: Record<SocialIconKey, string> = {
  telegram: "تلگرام",
  instagram: "اینستاگرام",
  rubika: "روبیکا",
  whatsapp: "واتس‌اپ",
  bale: "بله",
  eitaa: "ایتا",
};

/** رنگ رسمی هر شبکه — وقتی مدیر رنگی انتخاب نکرده باشد. */
export const SOCIAL_ICON_COLORS: Record<SocialIconKey, string> = {
  telegram: "#229ED9",
  instagram: "#e1306c",
  rubika: "#1976d2",
  whatsapp: "#25D366",
  bale: "#00b0a3",
  eitaa: "#ff8f00",
};

export const SOCIAL_ICON_KEYS = Object.keys(SOCIAL_ICON_LABELS) as SocialIconKey[];

export function isSocialIcon(value: string): value is SocialIconKey {
  return (SOCIAL_ICON_KEYS as string[]).includes(value);
}

/** سه کانال پیش‌فرض — دقیقاً همان‌هایی که قبلاً در کد ثابت بودند. */
export const DEFAULT_SOCIALS: SocialLink[] = [
  { name: "تلگرام", href: "http" + "s://t.me/bellaperfume", icon: "telegram", color: "" },
  {
    name: "اینستاگرام",
    href: "http" + "s://instagram.com/bella.perfume",
    icon: "instagram",
    color: "",
  },
  { name: "روبیکا", href: "http" + "s://rubika.ir/bellaperfume", icon: "rubika", color: "" },
];

/**
 * لینک کانال را قابل‌کلیک می‌کند.
 *
 * درس گرفته از باگ «لینک نماد کار نمی‌کند»: اگر مدیر فقط t.me/bella
 * بنویسد، مرورگر آن را مسیر داخلی سایت می‌فهمد و صفحهٔ ۴۰۴ باز می‌شود.
 * mailto: و tel: عمداً مجازند؛ javascript: و data: دور ریخته می‌شوند.
 */
export function safeSocialHref(raw: string): string {
  const value = (raw || "").trim();
  if (!value) return "";
  if (/^https?:[/][/]/i.test(value)) return value;
  if (/^mailto:/i.test(value) || /^tel:/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";
  return "http" + "s://" + value.replace(/^[/]+/, "");
}

/**
 * فهرست ذخیره‌شده را می‌خواند. هر ردیف بدون نام یا بدون لینک قابل‌استفاده
 * حذف می‌شود. اگر داده خراب باشد fallback برمی‌گردد تا صفحه خالی نشود؛
 * اما فهرستِ عمداً خالی (آرایهٔ [] ذخیره‌شده) احترام دارد و ردیف را مخفی می‌کند.
 */
export function parseSocials(
  raw: string | undefined,
  fallback: SocialLink[] = DEFAULT_SOCIALS,
): SocialLink[] {
  if (raw === undefined || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const s = item as Partial<SocialLink>;
        const icon = String(s.icon ?? "telegram");
        return {
          name: String(s.name ?? "").slice(0, 40),
          href: safeSocialHref(String(s.href ?? "")),
          icon: (isSocialIcon(icon) ? icon : "telegram") as SocialIconKey,
          color: String(s.color ?? "").slice(0, 30),
        };
      })
      .filter((s) => s.name.trim() && s.href)
      .slice(0, 12);
  } catch {
    return fallback;
  }
}

/** رنگ نهایی دایرهٔ آیکن. */
export function socialColor(link: SocialLink): string {
  return link.color.trim() || SOCIAL_ICON_COLORS[link.icon] || "#d4af37";
}
