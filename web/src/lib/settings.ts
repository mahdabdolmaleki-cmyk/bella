// Server-side helper to read public site settings from the Express API.
// Used by the root layout and home page (server components).

export const SETTING_KEYS = [
  "loginPhoneEnabled",
  "loginEmailEnabled",
  "festivalActive",
  "festivalTitle",
  "festivalSubtitle",
  "footerAbout",
  "tomanPerPoint",
  "tierGoldSpend",
  "tierDiamondSpend",
  "journeyStages",
  "journeyBottleGlass",
  "journeyBottleLiquid",
  "journeyBottleImage",
  "homeBrands",
  "sectionIcons",
  "homeFeatures",
  "footerBadges",
  "shopCategories",
  "contactSocialIntro",
  "contactSocials",
  "contactPhone",
  "contactAddress",
  "contactHours",
  "footerGuaranteeTitle",
  "footerGuarantees",
  "paymentsDisabled",
  "paymentsDisabledNote",
] as const;

// Every setting travels as a string so one generic admin form can edit them.
export type SiteSettingsMap = {
  /** "1" = ورود با کد پیامکی فعال است. */
  loginPhoneEnabled: string;
  /** "1" = ورود با کد ایمیلی فعال است. */
  loginEmailEnabled: string;
  festivalActive: string;
  festivalTitle: string;
  festivalSubtitle: string;
  footerAbout: string;
  // باشگاه مشتریان
  tomanPerPoint: string;
  tierGoldSpend: string;
  tierDiamondSpend: string;
  // متن مراحل اسکرول صفحه اصلی (JSON) + رنگ بطری
  journeyStages: string;
  journeyBottleGlass: string;
  journeyBottleLiquid: string;
  /** Uploaded photo that replaces the drawn bottle on the home page. */
  journeyBottleImage: string;
  /** JSON list of the home-page brand cards. */
  homeBrands: string;
  /** JSON map of section -> icon file name (see lib/icons.ts). */
  sectionIcons: string;
  /** JSON list of the «مزیت‌های فروشگاه» cards. */
  homeFeatures: string;
  /** JSON list of footer trust badges (نماد اعتماد، ساماندهی، …). */
  footerBadges: string;
  /** JSON list of the shop category chips, editable by the admin. */
  shopCategories: string;
  /** متن بالای ردیف شبکه‌های اجتماعی در صفحهٔ تماس. */
  contactSocialIntro: string;
  /** JSON list of the social channels shown on the contact page. */
  contactSocials: string;
  contactPhone: string;
  contactAddress: string;
  contactHours: string;
  /** تیتر ستون «ضمانت‌های بلا» در فوتر. خالی = ستون حذف می‌شود. */
  footerGuaranteeTitle: string;
  /** هر خط یک ردیف ضمانت. */
  footerGuarantees: string;
  /** "1" = ثبت سفارش و پرداخت موقتاً بسته است. */
  paymentsDisabled: string;
  /** پیامی که در حالت تعمیر به مشتری نشان داده می‌شود. */
  paymentsDisabledNote: string;
};

/** متن چندخطی ضمانت‌ها را به لیست تمیز تبدیل می‌کند (حداکثر ۸ ردیف). */
export function parseGuarantees(raw: string | undefined): string[] {
  return (raw ?? "")
    .split("\n")
    .map((line) => line.replace(/^[\s◆*•-]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** One clickable badge image in the site footer. */
export type FooterBadge = {
  /** Alt text / tooltip, e.g. «نماد اعتماد الکترونیکی». */
  title: string;
  /** Uploaded image path or https URL. */
  image: string;
  /** Optional verification link the badge opens in a new tab. */
  link: string;
};

/**
 * Parses the admin-edited badge list. A badge with no image is dropped and any
 * malformed value yields an empty list, so a bad edit hides the row instead of
 * crashing the footer on every page of the site.
 */
/**
 * لینک نماد را قابل‌استفاده می‌کند. دو حالت باعث می‌شد کلیک روی نماد
 * کار نکند: نبودن پیشوند (enamad.ir به‌جای نشانی کامل) که مرورگر آن را
 * مسیر داخلی سایت حساب می‌کند، و دادهٔ قدیمی که لینکش خالی مانده بود.
 * هر پروتکل غیر http/https (مثلاً javascript:) دور ریخته می‌شود.
 */
function safeBadgeLink(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:[/][/]/i.test(value)) return value;
  // هر چیزی که پروتکل دیگری دارد مردود است.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";
  return "http" + "s://" + value.replace(/^[/]+/, "");
}

export function parseFooterBadges(raw: string | undefined): FooterBadge[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const badge = item as Partial<FooterBadge>;
        return {
          title: String(badge.title ?? ""),
          image: String(badge.image ?? ""),
          link: safeBadgeLink(String(badge.link ?? "")),
        };
      })
      .filter((badge) => badge.image.trim());
  } catch {
    return [];
  }
}

export type BrandCard = {
  en: string;
  fa: string;
  country: string;
  year: string;
  d: string;
};

/**
 * Parses the admin-edited brand list. Anything malformed falls back to the
 * built-in cards so a bad edit can never empty the home page.
 */
export function parseBrands(raw: string | undefined, fallback: BrandCard[]): BrandCard[] {
  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const cleaned = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const brand = item as Partial<BrandCard>;
        return {
          en: String(brand.en ?? ""),
          fa: String(brand.fa ?? ""),
          country: String(brand.country ?? ""),
          year: String(brand.year ?? ""),
          d: String(brand.d ?? ""),
        };
      })
      .filter((brand) => brand.en.trim() || brand.fa.trim());
    return cleaned.length ? cleaned : fallback;
  } catch {
    return fallback;
  }
}

/** دسته‌بندی‌های پیش‌فرض فروشگاه — تا وقتی ادمین دستهٔ خودش را نساخته. */
export const DEFAULT_SHOP_CATEGORIES = ["زنانه", "مردانه", "یونیسکس"];

/**
 * فهرست دسته‌بندی‌های فروشگاه که ادمین ساخته است.
 *
 * مثل بقیهٔ parse‌ها، هر مقدار خرابی به پیش‌فرض برمی‌گردد، تا یک ویرایش
 * اشتباه نتواند نوار دسته‌بندی را خالی کند.
 */
export function parseShopCategories(
  raw: string | undefined,
  fallback: string[] = DEFAULT_SHOP_CATEGORIES,
): string[] {
  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const cleaned = [
      ...new Set(
        parsed
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
          .slice(0, 30),
      ),
    ];
    return cleaned.length ? cleaned : fallback;
  } catch {
    return fallback;
  }
}

// One stage of the home-page scroll story.
export type JourneyStage = { t: string; d: string };

/**
 * Parses the admin-edited JSON safely. Any malformed value falls back to the
 * built-in stages, so a bad edit can never blank out the home page.
 */
export function parseJourneyStages(
  raw: string | undefined,
  fallback: JourneyStage[],
): JourneyStage[] {
  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const cleaned = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        t: String((item as JourneyStage).t ?? ""),
        d: String((item as JourneyStage).d ?? ""),
      }));
    // The story only works with the same number of stages as the animation.
    return cleaned.length === fallback.length ? cleaned : fallback;
  } catch {
    return fallback;
  }
}

export const DEFAULT_SETTINGS: SiteSettingsMap = {
  loginPhoneEnabled: "1",
  loginEmailEnabled: "1",
  festivalActive: "true",
  festivalTitle: "جشنواره خرید اول بلا",
  festivalSubtitle: "۲۵٪ تخفیف + اتومایزر هدیه",
  footerAbout:
    "مزون بلا از سال ۱۳۹۸ با الهام از عطرسازی کلاسیک فرانسوی و اسانس‌های شرقی، رایحه‌هایی ماندگار برای سلیقه‌های خاص می‌آفریند.",
  tomanPerPoint: "10000",
  tierGoldSpend: "20000000",
  tierDiamondSpend: "60000000",
  // Empty = keep the built-in default story text and bottle colours.
  journeyStages: "",
  journeyBottleGlass: "#0d3b26",
  journeyBottleLiquid: "#d4af37",
  journeyBottleImage: "",
  homeBrands: "",
  sectionIcons: "",
  homeFeatures: "",
  footerBadges: "",
  shopCategories: "",
  contactSocialIntro: "بلا را در شبکه‌های اجتماعی دنبال کنید",
  contactSocials: "",
  contactPhone: "۰۲۱ – ۲۲ ۴۴ ۶۶ ۸۸",
  contactAddress: "تهران، خیابان فرشته، پاساژ رویال، واحد ۱۲",
  contactHours: "هر روز ۱۰ صبح تا ۱۰ شب",
  footerGuaranteeTitle: "ضمانت‌های بلا",
  footerGuarantees:
    "اصالت اسانس با هولوگرام اختصاصی\n۷ روز ضمانت بازگشت بدون قید و شرط\nارسال بیمه‌شده در پاکت مخملی\nپشتیبانی رایحه‌شناس به‌صورت ۲۴/۷",
  paymentsDisabled: "",
  paymentsDisabledNote:
    "فروشگاه به‌دلیل به‌روزرسانی موقتاً سفارش نمی‌پذیرد. تا ساعاتی دیگر دوباره در خدمت شما هستیم.",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function getSiteSettings(): Promise<SiteSettingsMap> {
  try {
    // PERF: `no-store` forced two API round-trips (layout + page) on EVERY
    // page view and disabled static rendering completely. A 60s revalidate
    // window is plenty for banner/footer text.
    const res = await fetch(`${API_BASE}/api/settings`, {
      next: { revalidate: 60, tags: ["site-settings"] },
    });
    if (!res.ok) return DEFAULT_SETTINGS;
    const data = await res.json();
    return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
