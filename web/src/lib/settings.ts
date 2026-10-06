// Server-side helper to read public site settings from the Express API.
// Used by the root layout and home page (server components).

export const SETTING_KEYS = [
  "loginPhoneEnabled",
  "loginEmailEnabled",
  "festivalActive",
  "festivalTitle",
  "festivalSubtitle",
  "discountsBoxActive",
  "discountsBoxTitle",
  "discountsBoxSubtitle",
  "firstPurchaseDiscountEnabled",
  "firstPurchasePercent",
  "couponEnabled",
  "couponCodesJson",
  "vipBoxEnabled",
  "vipBoxTitle",
  "vipBoxDesc",
  "vipBoxFee",
  "footerAbout",
  "tomanPerPoint",
  "tierGoldSpend",
  "tierDiamondSpend",
  "shippingFreeThreshold",
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
  "contactEmail",
  "contactAddress",
  "contactHours",
  "footerGuaranteeTitle",
  "footerGuarantees",
  "paymentsDisabled",
  "paymentsDisabledNote",
  "zarinpalAutoVerify",
  "termsTitle",
  "termsText",
  "abandonedCartEnabled",
  "abandonedCartFirstHours",
  "abandonedCartSecondHours",
  "smsirAbandonedFirstTemplate",
  "smsirAbandonedSecondTemplate",
  "smsirAbandonedFirstParams",
  "smsirAbandonedSecondParams",
  "smsAbandonedFirstEnabled",
  "smsAbandonedSecondEnabled",
  "smsirCancelAdminTemplate",
  "smsirCancelAdminParams",
  "smsCancelAdminEnabled",
  "emailAdmin",
  "emailOtpEnabled",
  "emailOrderPlacedEnabled",
  "emailAdminNotifyEnabled",
  "emailOrderStatusEnabled",
  "emailAbandonedFirstEnabled",
  "emailAbandonedSecondEnabled",
  "emailCancelAdminEnabled",
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
  /** "1" = کارت جداگانهٔ تخفیف‌ها زیر بنر جشنواره نمایش داده می‌شود. */
  discountsBoxActive: string;
  /** عنوان کارت تخفیف‌ها. */
  discountsBoxTitle: string;
  /** توضیح کارت تخفیف‌ها. */
  discountsBoxSubtitle: string;
  /** "1" = تخفیف خرید اول فعال. */
  firstPurchaseDiscountEnabled: string;
  /** درصد تخفیف خرید اول (۰ تا ۰). */
  firstPurchasePercent: string;
  /** "1" = کدهای تخفیف فعال‌اند (v40). */
  couponEnabled: string;
  /** JSON لیست کدها: [{code,percent,until}] */
  couponCodesJson: string;
  /** "1" = باکس ویژه VIP در زمان خرید پیشنهاد می‌شود. */
  vipBoxEnabled: string;
  /** عنوان باکس VIP. */
  vipBoxTitle: string;
  /** توضیح باکس VIP. */
  vipBoxDesc: string;
  /** هزینه باکس VIP (تومان). */
  vipBoxFee: string;
  footerAbout: string;
  // باشگاه مشتریان
  tomanPerPoint: string;
  tierGoldSpend: string;
  tierDiamondSpend: string;
  /** حداقل مبلغ کالاها برای ارسال رایگان، به تومان. */
  shippingFreeThreshold: string;
  /** "1" = نمایش زمان تحویل به خریدار فعال است؛ "" = مخفی. */
  deliveryEstimateEnabled: string;
  /** مدت تحویل پست معمولی / پیشتاز (مثلاً "7" یا "5 تا 7"). */
  deliveryDaysPishtaz: string;
  /** مدت تحویل تیپاکس (مثلاً "2" یا "1 تا 2"). */
  deliveryDaysTipax: string;
  /** مدت تحویل چاپار اکسپرس (مثلاً "2"). */
  deliveryDaysChapar: string;
  /** مدت تحویل پیک محلی (مثلاً "1"). */
  deliveryDaysPeyk: string;
  /** روش‌های ارسال فعال — "1" = نمایش به مشتری، "" = مخفی. */
  shippingTipaxEnabled: string;
  shippingPishtazEnabled: string;
  shippingChaparEnabled: string;
  shippingPeykEnabled: string;
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
  /** ایمیل سایت — در صفحهٔ تماس به‌صورت کارت mailto نمایش داده می‌شود. خالی = حذف کارت. */
  contactEmail: string;
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
  /** تنظیمات تراکنش زرین‌پال: "1" = خودکار، خالی = غیرخودکار (verify توسط سایت). */
  zarinpalAutoVerify: string;
  /** عنوان صفحهٔ قوانین و مقررات (/terms). */
  termsTitle: string;
  /** متن صفحهٔ قوانین — هر خط یک پاراگراف. */
  termsText: string;
  // ---- پیامک‌ها ----
  /** شماره خط اختصاصی sms.ir برای ارسال bulk. */
  smsirLine: string;
  /** شناسهٔ قالب کد تأیید در پنل sms.ir. */
  smsirTemplateId: string;
  /** نام پارامتر کد داخل قالب sms.ir (مثل Code). */
  smsirOtpParam: string;
  /** "" = پیامک کد تأیید (ورود و تغییر مشخصات) خاموش. */
  smsOtpEnabled: string;
  /** شناسهٔ قالب ثبت سفارش (مشتری) در پنل sms.ir. */
  smsirOrderPlacedTemplate: string;
  /** شناسهٔ قالب سفارش جدید (مدیر) در پنل sms.ir. */
  smsirAdminOrderTemplate: string;
  /** شناسهٔ قالب تغییر وضعیت سفارش در پنل sms.ir. */
  smsirOrderStatusTemplate: string;
  /** نام پارامترهای قالب ثبت سفارش — دقیقاً مثل پنل sms.ir، جدا با کاما. */
  smsirOrderPlacedParams: string;
  /** نام پارامترهای قالب پیامک مدیر — جدا با کاما. */
  smsirAdminOrderParams: string;
  /** نام پارامترهای قالب تغییر وضعیت — جدا با کاما. */
  smsirOrderStatusParams: string;
  /** "1" = پیامک ثبت سفارش به مشتری فعال است. */
  smsOrderPlacedEnabled: string;
  /** "1" = اطلاع‌رسانی سفارش جدید به مدیر فعال است. */
  smsAdminNotifyEnabled: string;
  /** شماره موبایل مدیر — فقط از مسیر ادمین می‌آید، در DTO عمومی نیست. */
  smsAdminPhone: string;
  /** "1" = پیامک تغییر وضعیت سفارش فعال است. */
  smsOrderStatusEnabled: string;
  // ---- سبد رها شده (v36) ----
  abandonedCartEnabled: string;
  abandonedCartFirstHours: string;
  abandonedCartSecondHours: string;
  smsirAbandonedFirstTemplate: string;
  smsirAbandonedSecondTemplate: string;
  smsirAbandonedFirstParams: string;
  smsirAbandonedSecondParams: string;
  smsAbandonedFirstEnabled: string;
  smsAbandonedSecondEnabled: string;
  // ---- گزارش لغو (v38) ----
  smsirCancelAdminTemplate: string;
  smsirCancelAdminParams: string;
  smsCancelAdminEnabled: string;
  // ---- ایمیل‌ها همزمان با پیامک (v38) ----
  emailAdmin: string;
  emailOtpEnabled: string;
  emailOrderPlacedEnabled: string;
  emailAdminNotifyEnabled: string;
  emailOrderStatusEnabled: string;
  emailAbandonedFirstEnabled: string;
  emailAbandonedSecondEnabled: string;
  emailCancelAdminEnabled: string;
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

/**
 * نماد اینماد را از هر چیزی که مدیر بچسباند (لینک استعلام، آدرس لوگو یا کل
 * کد HTML اینماد) بیرون می‌کشد. اینماد فقط لوگوی زنده از trustseal.enamad.ir
 * را قبول می‌کند (تصویر آپلودشده معتبر نیست)، پس آدرس لوگو از روی id و Code
 * ساخته می‌شود. «&amp;» داخل کد HTML اینماد هم به «&» برگردانده می‌شود؛ وگرنه
 * پارامتر به «amp;Code» تبدیل می‌شد و نماد نمایش داده نمی‌شد.
 */
export function parseEnamadSeal(
  raw: string,
): { link: string; image: string; code: string } | null {
  const value = (raw || "").replace(/&amp;/gi, "&");
  if (!/trustseal\.enamad\.ir/i.test(value)) return null;
  const id = /[?&]id=(\d+)/i.exec(value)?.[1];
  const code = /[?&]code=([A-Za-z0-9]+)/i.exec(value)?.[1];
  if (!id || !code) return null;
  const base = "http" + "s://trustseal.enamad.ir/";
  return {
    link: `${base}?id=${id}&Code=${code}`,
    image: `${base}logo.aspx?id=${id}&Code=${code}`,
    code,
  };
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
        const link = String(badge.link ?? "");
        const image = String(badge.image ?? "");
        const seal = parseEnamadSeal(link) || parseEnamadSeal(image);
        return {
          title: String(badge.title ?? ""),
          // اینماد: همیشه لوگوی زنده، حتی اگر قبلاً تصویرش آپلود شده بود.
          image: seal ? seal.image : image,
          link: seal ? seal.link : safeBadgeLink(link),
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
  discountsBoxActive: "1",
  discountsBoxTitle: "تخفیف‌های بلا",
  discountsBoxSubtitle: "ادکلن‌های مشمول تخفیف را ببینید",
  firstPurchaseDiscountEnabled: "",
  firstPurchasePercent: "25",
  couponEnabled: "",
  couponCodesJson: "[]",
  vipBoxEnabled: "",
  vipBoxTitle: "باکس ویژه VIP",
  vipBoxDesc: "ادکلن شما داخل باکس لوکس و مخملی، با روبان طلایی ارسال می‌شود.",
  vipBoxFee: "150000",
  footerAbout:
    "مزون بلا از سال ۱۳۹۸ با الهام از عطرسازی کلاسیک فرانسوی و رایحه‌های شرقی، رایحه‌هایی ماندگار برای سلیقه‌های خاص می‌آفریند.",
  tomanPerPoint: "10000",
  tierGoldSpend: "20000000",
  tierDiamondSpend: "60000000",
  shippingFreeThreshold: "5000000",
  deliveryEstimateEnabled: "1",
  deliveryDaysPishtaz: "7",
  deliveryDaysTipax: "2",
  deliveryDaysChapar: "2",
  deliveryDaysPeyk: "1",
  shippingTipaxEnabled: "1",
  shippingPishtazEnabled: "1",
  shippingChaparEnabled: "1",
  shippingPeykEnabled: "1",
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
  contactEmail: "",
  contactAddress: "تهران، خیابان فرشته، پاساژ رویال، واحد ۱۲",
  contactHours: "هر روز ۱۰ صبح تا ۱۰ شب",
  footerGuaranteeTitle: "ضمانت‌های بلا",
  footerGuarantees:
    "اصالت رایحه با هولوگرام اختصاصی\n۷ روز ضمانت بازگشت بدون قید و شرط\nارسال بیمه‌شده در پاکت مخملی\nپشتیبانی رایحه‌شناس به‌صورت ۲۴/۷",
  paymentsDisabled: "",
  paymentsDisabledNote:
    "فروشگاه به‌دلیل به‌روزرسانی موقتاً سفارش نمی‌پذیرد. تا ساعاتی دیگر دوباره در خدمت شما هستیم.",
  zarinpalAutoVerify: "",
  termsTitle: "قوانین و مقررات بلا پرفیوم",
  termsText: [
    "خوش آمدید! استفاده از فروشگاه بلا پرفیوم به معنای پذیرش قوانین زیر است.",
    "۱. اصالت کالا: تمامی عطرها دارای هولوگرام اصالت و ضمانت سلامت فیزیکی هستند.",
    "۲. قیمت‌ها: قیمت‌های درج‌شده به تومان بوده و در لحظهٔ ثبت سفارش معتبرند.",
    "۳. ارسال: سفارش‌ها پس از تأیید پرداخت، حداکثر تا ۲ روز کاری ارسال می‌شوند.",
    "۴. بازگشت کالا: تا ۷ روز پس از دریافت، در صورت باز نشدن پلمب محصول، امکان بازگشت وجود دارد.",
    "۵. اطلاعات شخصی: اطلاعات مشتریان فقط برای پردازش سفارش استفاده می‌شود و محرمانه است.",
    "۶. پشتیبانی: پاسخگویی به سؤالات هر روز از ساعت ۱۰ صبح تا ۱۰ شب از طریق صفحهٔ تماس با ما.",
  ].join("\n"),
  // ---- پیامک‌ها ----
  smsirLine: "",
  smsirTemplateId: "",
  smsirOtpParam: "Code",
  smsOtpEnabled: "1",
  smsirOrderPlacedTemplate: "",
  smsirAdminOrderTemplate: "",
  smsirOrderStatusTemplate: "",
  smsirOrderPlacedParams: "ORDERID, NAME, TOTAL",
  smsirAdminOrderParams: "ORDERID, NAME, TOTAL, PHONE",
  smsirOrderStatusParams: "ORDERID, STATUS",
  smsOrderPlacedEnabled: "1",
  smsAdminNotifyEnabled: "1",
  smsAdminPhone: "",
  smsOrderStatusEnabled: "1",
  abandonedCartEnabled: "",
  abandonedCartFirstHours: "2",
  abandonedCartSecondHours: "12",
  smsirAbandonedFirstTemplate: "",
  smsirAbandonedSecondTemplate: "",
  smsirAbandonedFirstParams: "NAME, TOTAL",
  smsirAbandonedSecondParams: "NAME, TOTAL",
  smsAbandonedFirstEnabled: "",
  smsAbandonedSecondEnabled: "",
  smsirCancelAdminTemplate: "",
  smsirCancelAdminParams: "ORDERID, NAME, TOTAL, PHONE",
  smsCancelAdminEnabled: "",
  emailAdmin: "",
  emailOtpEnabled: "1",
  emailOrderPlacedEnabled: "",
  emailAdminNotifyEnabled: "",
  emailOrderStatusEnabled: "",
  emailAbandonedFirstEnabled: "",
  emailAbandonedSecondEnabled: "",
  emailCancelAdminEnabled: "",
};

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

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
