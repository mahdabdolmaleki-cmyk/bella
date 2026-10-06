import mongoose from "mongoose";

export const DEFAULT_SETTINGS = {
  // Login methods controlled by the owner. At least one must stay enabled.
  loginPhoneEnabled: "1",
  loginEmailEnabled: "1",
  festivalActive: "true",
  festivalTitle: "جشنواره خرید اول بلا",
  festivalSubtitle: "۲۵٪ تخفیف + اتومایزر هدیه",
  footerAbout:
    "مزون بلا از سال ۱۳۹۸ با الهام از عطرسازی کلاسیک فرانسوی و اسانس‌های شرقی، رایحه‌هایی ماندگار برای سلیقه‌های خاص می‌آفریند.",
  // Loyalty club: how many Toman of settled purchases earn one point, and the
  // spend thresholds for the golden / diamond memberships.
  tomanPerPoint: 10000,
  tierGoldSpend: 20000000,
  tierDiamondSpend: 60000000,
  // Minimum goods subtotal (Toman) that makes eligible couriers free.
  shippingFreeThreshold: 5000000,
  // زمان تحویل سفارش به مشتری
  deliveryEstimateEnabled: "1",
  deliveryDaysPishtaz: "7",
  deliveryDaysTipax: "2",
  deliveryDaysChapar: "2",
  deliveryDaysPeyk: "1",
  // روش‌های ارسال فعال — "1" = به مشتری نمایش داده می‌شود، "" = مخفی
  shippingTipaxEnabled: "1",
  shippingPishtazEnabled: "1",
  shippingChaparEnabled: "1",
  shippingPeykEnabled: "1",
  // Home-page scroll story. Empty string = use the built-in default text, so
  // the site looks exactly the same until an admin decides to change it.
  journeyStages: "",
  journeyBottleGlass: "#0d3b26",
  journeyBottleLiquid: "#d4af37",
  // Optional uploaded photo that replaces the drawn bottle on the home page.
  journeyBottleImage: "",
  // JSON array of home-page brand cards. Empty = built-in list.
  homeBrands: "",
  // JSON map of { section: iconName } — which icon from /public/icons each
  // section of the storefront shows. Empty = built-in choices.
  sectionIcons: "",
  // JSON array of { icon, title, desc } cards for the «مزیت‌های فروشگاه» strip.
  homeFeatures: "",
  // JSON array of { title, image, link } footer trust badges — نماد اعتماد،
  // ساماندهی, payment logos, etc. Empty = the footer badge row is hidden.
  footerBadges: "",
  // JSON array of shop category names («زنانه، مردانه، یونیسکس، …»). Empty = the
  // three built-in ones. These drive both the shop filter chips and the
  // category dropdown in the product editor.
  shopCategories: "",
  // ---- صفحهٔ تماس با ما (v31) ----
  // متنی که بالای ردیف شبکه‌های اجتماعی می‌نشیند.
  contactSocialIntro: "بلا را در شبکه‌های اجتماعی دنبال کنید",
  // JSON array of { name, href, icon, color } social channels.
  // خالی = همان سه کانال پیش‌فرض سایت.
  contactSocials: "",
  contactPhone: "۰۲۱ – ۲۲ ۴۴ ۶۶ ۸۸",
  // ایمیل سایت — خالی یعنی کارت ایمیل در صفحهٔ تماس نمایش داده نمی‌شود.
  contactEmail: "",
  contactAddress: "تهران، خیابان فرشته، پاساژ رویال، واحد ۱۲",
  contactHours: "هر روز ۱۰ صبح تا ۱۰ شب",
  // ---- فوتر: ستون «ضمانت‌های بلا» (v33) ----
  // هر خط از footerGuarantees یک ردیف لیست است. هر دو خالی = ستون حذف.
  footerGuaranteeTitle: "ضمانت‌های بلا",
  footerGuarantees:
    "اصالت اسانس با هولوگرام اختصاصی\n۷ روز ضمانت بازگشت بدون قید و شرط\nارسال بیمه‌شده در پاکت مخملی\nپشتیبانی رایحه‌شناس به‌صورت ۲۴/۷",
  // ---- حالت تعمیر پرداخت (v33) ----
  // "1" = پرداخت و ثبت سفارش موقتاً بسته است.
  paymentsDisabled: "",
  paymentsDisabledNote:
    "فروشگاه به‌دلیل به‌روزرسانی موقتاً سفارش نمی‌پذیرد. تا ساعاتی دیگر دوباره در خدمت شما هستیم.",
  // ---- تنظیمات تراکنش زرین‌پال (v37) ----
  // "1" = خودکار (اعتبارسنجی توسط زرین‌پال در پایان روز)؛ خالی = غیرخودکار
  // (سایت خودش verify می‌کند و پرداختِ تأییدنشده به مشتری عودت می‌شود).
  zarinpalAutoVerify: "", 
  // ---- کارت تخفیف‌های صفحهٔ اصلی (جدا از بنر جشنواره) ----
  discountsBoxActive: "1",
  discountsBoxTitle: "تخفیف‌های بلا",
  discountsBoxSubtitle: "ادکلن‌های مشمول تخفیف را ببینید",
  // ---- تخفیف خرید اول مشتری ----
  firstPurchaseDiscountEnabled: "",
  firstPurchasePercent: "25",
  // v40 — کدهای تخفیف
  couponEnabled: "",
  couponCodesJson: "[]",
  // ---- باکس ویژه (VIP) در زمان خرید ----
  vipBoxEnabled: "",
  vipBoxTitle: "باکس ویژه VIP",
  vipBoxDesc: "ادکلن شما داخل باکس لوکس و مخملی، با روبان طلایی ارسال می‌شود.",
  vipBoxFee: "150000",
  // ---- پیامک‌ها — sms.ir ----
  // متن هر پیامک در پنل sms.ir (بخش قالب‌ها) تعریف می‌شود؛ این‌جا فقط
  // شناسهٔ قالب هر رویداد نگه داشته می‌شود.
  smsirLine: "",
  smsirTemplateId: "",
  smsirOtpParam: "Code",
  // "1" = پیامک کد تأیید (ورود و تغییر مشخصات) فعال است.
  smsOtpEnabled: "1",
  smsirOrderPlacedTemplate: "",
  smsirAdminOrderTemplate: "",
  smsirOrderStatusTemplate: "",
  // نام پارامترهای هر قالب، جدا شده با کاما — دقیقاً همان‌هایی که در پنل
  // sms.ir تعریف شده‌اند (ترتیب مقادیر در هر رویداد ثابت است).
  smsirOrderPlacedParams: "ORDERID, NAME, TOTAL",
  smsirAdminOrderParams: "ORDERID, NAME, TOTAL, PHONE",
  smsirOrderStatusParams: "ORDERID, STATUS",
  // کلیدهای روشن/خاموش رویدادها.
  smsOrderPlacedEnabled: "1",
  smsAdminNotifyEnabled: "1",
  smsAdminPhone: "",
  smsOrderStatusEnabled: "1",
  // ---- سبد رها شده (v36) ----
  abandonedCartEnabled: "",
  abandonedCartFirstHours: "2",
  abandonedCartSecondHours: "12",
  smsirAbandonedFirstTemplate: "",
  smsirAbandonedSecondTemplate: "",
  smsirAbandonedFirstParams: "NAME, TOTAL",
  smsirAbandonedSecondParams: "NAME, TOTAL",
  smsAbandonedFirstEnabled: "",
  smsAbandonedSecondEnabled: "",
  // ---- گزارش لغو سفارش به ادمین (v38) ----
  smsirCancelAdminTemplate: "",
  smsirCancelAdminParams: "ORDERID, NAME, TOTAL, PHONE",
  smsCancelAdminEnabled: "",
  // ---- ایمیل‌ها — همزمان با پیامک‌ها (v38) ----
  emailAdmin: "",
  emailOtpEnabled: "1",
  emailOrderPlacedEnabled: "",
  emailAdminNotifyEnabled: "",
  emailOrderStatusEnabled: "",
  emailAbandonedFirstEnabled: "",
  emailAbandonedSecondEnabled: "",
  emailCancelAdminEnabled: "",
  // ---- صفحهٔ قوانین و مقررات ----
  // عنوان و متن صفحهٔ /terms — هر خط از متن یک پاراگراف است و ادمین آن را
  // از تنظیمات ← قوانین و مقررات ویرایش می‌کند. خالی = متن پیش‌فرض.
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
};

// Numeric settings are validated with num() instead of str() in the admin PUT.
export const NUMERIC_SETTINGS = {
  tomanPerPoint: { min: 1, max: 100000000 },
  tierGoldSpend: { min: 0, max: 1e12 },
  tierDiamondSpend: { min: 0, max: 1e12 },
  shippingFreeThreshold: { min: 0, max: 1e12 },
  // v35 — تخفیف خرید اول (۰ تا ۹۰ درصد) و هزینهٔ باکس VIP (۰ تا ۱۰ میلیون تومان)
  // به‌صورت بازه‌ای اعتبارسنجی می‌شوند، نه فقط طول رشته.
  firstPurchasePercent: { min: 0, max: 90, clamp: false },
  vipBoxFee: { min: 0, max: 10000000, clamp: false },
  abandonedCartFirstHours: { min: 1, max: 168, clamp: false },
  abandonedCartSecondHours: { min: 1, max: 720, clamp: false },
};

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: "site", unique: true },
  loginPhoneEnabled: {
    type: String,
    default: DEFAULT_SETTINGS.loginPhoneEnabled,
    maxlength: 1,
  },
  loginEmailEnabled: {
    type: String,
    default: DEFAULT_SETTINGS.loginEmailEnabled,
    maxlength: 1,
  },
  festivalActive: { type: String, default: DEFAULT_SETTINGS.festivalActive },
  festivalTitle: { type: String, default: DEFAULT_SETTINGS.festivalTitle, maxlength: 120 },
  festivalSubtitle: { type: String, default: DEFAULT_SETTINGS.festivalSubtitle, maxlength: 200 },
  discountsBoxActive: { type: String, default: DEFAULT_SETTINGS.discountsBoxActive, maxlength: 4 },
  discountsBoxTitle: { type: String, default: DEFAULT_SETTINGS.discountsBoxTitle, maxlength: 80 },
  discountsBoxSubtitle: { type: String, default: DEFAULT_SETTINGS.discountsBoxSubtitle, maxlength: 160 },
  firstPurchaseDiscountEnabled: {
    type: String,
    default: DEFAULT_SETTINGS.firstPurchaseDiscountEnabled,
    maxlength: 4,
  },
  firstPurchasePercent: { type: String, default: DEFAULT_SETTINGS.firstPurchasePercent, maxlength: 4 },
  couponEnabled: { type: String, default: "", maxlength: 4 },
  couponCodesJson: { type: String, default: "[]", maxlength: 8000 },
  vipBoxEnabled: { type: String, default: DEFAULT_SETTINGS.vipBoxEnabled, maxlength: 4 },
  vipBoxTitle: { type: String, default: DEFAULT_SETTINGS.vipBoxTitle, maxlength: 80 },
  vipBoxDesc: { type: String, default: DEFAULT_SETTINGS.vipBoxDesc, maxlength: 200 },
  vipBoxFee: { type: String, default: DEFAULT_SETTINGS.vipBoxFee, maxlength: 9 },
  footerAbout: { type: String, default: DEFAULT_SETTINGS.footerAbout, maxlength: 1000 },
  tomanPerPoint: { type: Number, default: DEFAULT_SETTINGS.tomanPerPoint, min: 1 },
  tierGoldSpend: { type: Number, default: DEFAULT_SETTINGS.tierGoldSpend, min: 0 },
  tierDiamondSpend: { type: Number, default: DEFAULT_SETTINGS.tierDiamondSpend, min: 0 },
  shippingFreeThreshold: {
    type: Number,
    default: DEFAULT_SETTINGS.shippingFreeThreshold,
    min: 0,
  },
  deliveryEstimateEnabled: {
    type: String,
    default: DEFAULT_SETTINGS.deliveryEstimateEnabled,
    maxlength: 4,
  },
  deliveryDaysPishtaz: {
    type: String,
    default: DEFAULT_SETTINGS.deliveryDaysPishtaz,
    maxlength: 20,
  },
  deliveryDaysTipax: {
    type: String,
    default: DEFAULT_SETTINGS.deliveryDaysTipax,
    maxlength: 20,
  },
  deliveryDaysChapar: {
    type: String,
    default: DEFAULT_SETTINGS.deliveryDaysChapar,
    maxlength: 20,
  },
  deliveryDaysPeyk: {
    type: String,
    default: DEFAULT_SETTINGS.deliveryDaysPeyk,
    maxlength: 20,
  },
  shippingTipaxEnabled: { type: String, default: DEFAULT_SETTINGS.shippingTipaxEnabled, maxlength: 1 },
  shippingPishtazEnabled: { type: String, default: DEFAULT_SETTINGS.shippingPishtazEnabled, maxlength: 1 },
  shippingChaparEnabled: { type: String, default: DEFAULT_SETTINGS.shippingChaparEnabled, maxlength: 1 },
  shippingPeykEnabled: { type: String, default: DEFAULT_SETTINGS.shippingPeykEnabled, maxlength: 1 },
  // JSON array of { t, d } objects — stored as text so the admin panel can edit
  // it without a schema migration every time a stage is added.
  journeyStages: { type: String, default: DEFAULT_SETTINGS.journeyStages, maxlength: 4000 },
  journeyBottleGlass: { type: String, default: DEFAULT_SETTINGS.journeyBottleGlass, maxlength: 9 },
  journeyBottleLiquid: { type: String, default: DEFAULT_SETTINGS.journeyBottleLiquid, maxlength: 9 },
  journeyBottleImage: { type: String, default: DEFAULT_SETTINGS.journeyBottleImage, maxlength: 300 },
  // JSON array of { en, fa, country, year, d } brand cards.
  homeBrands: { type: String, default: DEFAULT_SETTINGS.homeBrands, maxlength: 8000 },
  // Icon choices + the home-page feature strip (both JSON text).
  sectionIcons: { type: String, default: DEFAULT_SETTINGS.sectionIcons, maxlength: 1200 },
  homeFeatures: { type: String, default: DEFAULT_SETTINGS.homeFeatures, maxlength: 6000 },
  footerBadges: { type: String, default: DEFAULT_SETTINGS.footerBadges, maxlength: 8000 },
  shopCategories: { type: String, default: DEFAULT_SETTINGS.shopCategories, maxlength: 2000 },
  // صفحهٔ تماس با ما.
  contactSocialIntro: {
    type: String,
    default: DEFAULT_SETTINGS.contactSocialIntro,
    maxlength: 300,
  },
  contactSocials: { type: String, default: DEFAULT_SETTINGS.contactSocials, maxlength: 8000 },
  contactPhone: { type: String, default: DEFAULT_SETTINGS.contactPhone, maxlength: 120 },
  contactEmail: { type: String, default: DEFAULT_SETTINGS.contactEmail, maxlength: 190 },
  contactAddress: { type: String, default: DEFAULT_SETTINGS.contactAddress, maxlength: 300 },
  contactHours: { type: String, default: DEFAULT_SETTINGS.contactHours, maxlength: 120 },
  // فوتر و حالت تعمیر (v33).
  footerGuaranteeTitle: {
    type: String,
    default: DEFAULT_SETTINGS.footerGuaranteeTitle,
    maxlength: 120,
  },
  footerGuarantees: {
    type: String,
    default: DEFAULT_SETTINGS.footerGuarantees,
    maxlength: 1200,
  },
  paymentsDisabled: { type: String, default: DEFAULT_SETTINGS.paymentsDisabled, maxlength: 4 },
  paymentsDisabledNote: {
    type: String,
    default: DEFAULT_SETTINGS.paymentsDisabledNote,
    maxlength: 300,
  },
  zarinpalAutoVerify: {
    type: String,
    default: DEFAULT_SETTINGS.zarinpalAutoVerify,
    maxlength: 4,
  },
  // صفحهٔ قوانین و مقررات (v34) — عنوان و متن قابل ویرایش از پنل تنظیمات.
  termsTitle: {
    type: String,
    default: DEFAULT_SETTINGS.termsTitle,
    maxlength: 160,
  },
  termsText: {
    type: String,
    default: DEFAULT_SETTINGS.termsText,
    maxlength: 20000,
  },
  // ---- پیامک‌ها — sms.ir ----
  smsirLine: { type: String, default: DEFAULT_SETTINGS.smsirLine, maxlength: 20 },
  smsirTemplateId: { type: String, default: DEFAULT_SETTINGS.smsirTemplateId, maxlength: 12 },
  smsirOtpParam: { type: String, default: DEFAULT_SETTINGS.smsirOtpParam, maxlength: 30 },
  smsOtpEnabled: { type: String, default: DEFAULT_SETTINGS.smsOtpEnabled, maxlength: 1 },
  smsirOrderPlacedTemplate: { type: String, default: DEFAULT_SETTINGS.smsirOrderPlacedTemplate, maxlength: 12 },
  smsirAdminOrderTemplate: { type: String, default: DEFAULT_SETTINGS.smsirAdminOrderTemplate, maxlength: 12 },
  smsirOrderStatusTemplate: { type: String, default: DEFAULT_SETTINGS.smsirOrderStatusTemplate, maxlength: 12 },
  smsirOrderPlacedParams: { type: String, default: DEFAULT_SETTINGS.smsirOrderPlacedParams, maxlength: 150 },
  smsirAdminOrderParams: { type: String, default: DEFAULT_SETTINGS.smsirAdminOrderParams, maxlength: 150 },
  smsirOrderStatusParams: { type: String, default: DEFAULT_SETTINGS.smsirOrderStatusParams, maxlength: 150 },
  smsOrderPlacedEnabled: { type: String, default: DEFAULT_SETTINGS.smsOrderPlacedEnabled, maxlength: 1 },
  smsAdminNotifyEnabled: { type: String, default: DEFAULT_SETTINGS.smsAdminNotifyEnabled, maxlength: 1 },
  smsAdminPhone: { type: String, default: DEFAULT_SETTINGS.smsAdminPhone, maxlength: 20 },
  smsOrderStatusEnabled: { type: String, default: DEFAULT_SETTINGS.smsOrderStatusEnabled, maxlength: 1 },
  // سبد رها شده
  abandonedCartEnabled: { type: String, default: DEFAULT_SETTINGS.abandonedCartEnabled, maxlength: 1 },
  abandonedCartFirstHours: { type: String, default: DEFAULT_SETTINGS.abandonedCartFirstHours, maxlength: 4 },
  abandonedCartSecondHours: { type: String, default: DEFAULT_SETTINGS.abandonedCartSecondHours, maxlength: 4 },
  smsirAbandonedFirstTemplate: { type: String, default: DEFAULT_SETTINGS.smsirAbandonedFirstTemplate, maxlength: 12 },
  smsirAbandonedSecondTemplate: { type: String, default: DEFAULT_SETTINGS.smsirAbandonedSecondTemplate, maxlength: 12 },
  smsirAbandonedFirstParams: { type: String, default: DEFAULT_SETTINGS.smsirAbandonedFirstParams, maxlength: 150 },
  smsirAbandonedSecondParams: { type: String, default: DEFAULT_SETTINGS.smsirAbandonedSecondParams, maxlength: 150 },
  smsAbandonedFirstEnabled: { type: String, default: DEFAULT_SETTINGS.smsAbandonedFirstEnabled, maxlength: 1 },
  smsAbandonedSecondEnabled: { type: String, default: DEFAULT_SETTINGS.smsAbandonedSecondEnabled, maxlength: 1 },
  smsirCancelAdminTemplate: { type: String, default: DEFAULT_SETTINGS.smsirCancelAdminTemplate, maxlength: 12 },
  smsirCancelAdminParams: { type: String, default: DEFAULT_SETTINGS.smsirCancelAdminParams, maxlength: 150 },
  smsCancelAdminEnabled: { type: String, default: DEFAULT_SETTINGS.smsCancelAdminEnabled, maxlength: 1 },
  emailAdmin: { type: String, default: DEFAULT_SETTINGS.emailAdmin, maxlength: 190 },
  emailOtpEnabled: { type: String, default: DEFAULT_SETTINGS.emailOtpEnabled, maxlength: 1 },
  emailOrderPlacedEnabled: { type: String, default: DEFAULT_SETTINGS.emailOrderPlacedEnabled, maxlength: 1 },
  emailAdminNotifyEnabled: { type: String, default: DEFAULT_SETTINGS.emailAdminNotifyEnabled, maxlength: 1 },
  emailOrderStatusEnabled: { type: String, default: DEFAULT_SETTINGS.emailOrderStatusEnabled, maxlength: 1 },
  emailAbandonedFirstEnabled: { type: String, default: DEFAULT_SETTINGS.emailAbandonedFirstEnabled, maxlength: 1 },
  emailAbandonedSecondEnabled: { type: String, default: DEFAULT_SETTINGS.emailAbandonedSecondEnabled, maxlength: 1 },
  emailCancelAdminEnabled: { type: String, default: DEFAULT_SETTINGS.emailCancelAdminEnabled, maxlength: 1 },
});

settingsSchema.statics.getSingleton = async function () {
  // findOneAndUpdate+upsert is atomic: two concurrent first-time requests used
  // to both call create() and one of them threw a duplicate-key 500.
  return this.findOneAndUpdate(
    { key: "site" },
    { $setOnInsert: { key: "site" } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

settingsSchema.methods.toDTO = function (includePrivate = false) {
  return {
    // Missing fields belong to legacy documents and mean "enabled". Only an
    // explicit empty string, written by the admin toggle, disables a method.
    loginPhoneEnabled: this.loginPhoneEnabled === "" ? "" : "1",
    loginEmailEnabled: this.loginEmailEnabled === "" ? "" : "1",
    festivalActive: this.festivalActive,
    festivalTitle: this.festivalTitle,
    festivalSubtitle: this.festivalSubtitle,
    discountsBoxActive: this.discountsBoxActive === "1" ? "1" : "",
    discountsBoxTitle: this.discountsBoxTitle ?? "",
    discountsBoxSubtitle: this.discountsBoxSubtitle ?? "",
    firstPurchaseDiscountEnabled: this.firstPurchaseDiscountEnabled === "1" ? "1" : "",
    firstPurchasePercent: this.firstPurchasePercent ?? "25",
    vipBoxEnabled: this.vipBoxEnabled === "1" ? "1" : "",
    vipBoxTitle: this.vipBoxTitle ?? "",
    vipBoxDesc: this.vipBoxDesc ?? "",
    vipBoxFee: this.vipBoxFee ?? "0",
    footerAbout: this.footerAbout,
    tomanPerPoint: String(this.tomanPerPoint ?? DEFAULT_SETTINGS.tomanPerPoint),
    tierGoldSpend: String(this.tierGoldSpend ?? DEFAULT_SETTINGS.tierGoldSpend),
    tierDiamondSpend: String(this.tierDiamondSpend ?? DEFAULT_SETTINGS.tierDiamondSpend),
    shippingFreeThreshold: String(
      this.shippingFreeThreshold ?? DEFAULT_SETTINGS.shippingFreeThreshold
    ),
    deliveryEstimateEnabled: this.deliveryEstimateEnabled === "" ? "" : "1",
    deliveryDaysPishtaz: this.deliveryDaysPishtaz || DEFAULT_SETTINGS.deliveryDaysPishtaz,
    deliveryDaysTipax: this.deliveryDaysTipax || DEFAULT_SETTINGS.deliveryDaysTipax,
    deliveryDaysChapar: this.deliveryDaysChapar || DEFAULT_SETTINGS.deliveryDaysChapar,
    deliveryDaysPeyk: this.deliveryDaysPeyk || DEFAULT_SETTINGS.deliveryDaysPeyk,
    shippingTipaxEnabled: this.shippingTipaxEnabled === "" ? "" : "1",
    shippingPishtazEnabled: this.shippingPishtazEnabled === "" ? "" : "1",
    shippingChaparEnabled: this.shippingChaparEnabled === "" ? "" : "1",
    shippingPeykEnabled: this.shippingPeykEnabled === "" ? "" : "1",
    journeyStages: this.journeyStages || "",
    journeyBottleGlass: this.journeyBottleGlass || DEFAULT_SETTINGS.journeyBottleGlass,
    journeyBottleLiquid: this.journeyBottleLiquid || DEFAULT_SETTINGS.journeyBottleLiquid,
    journeyBottleImage: this.journeyBottleImage || "",
    homeBrands: this.homeBrands || "",
    sectionIcons: this.sectionIcons || "",
    homeFeatures: this.homeFeatures || "",
    footerBadges: this.footerBadges || "",
    shopCategories: this.shopCategories || "",
    // در مورد متن‌های تماس، رشتهٔ خالی را عمداً حفظ می‌کنیم (?? نه ||)
    // تا اگر مدیر خواست یک ردیف را حذف کند، متن پیش‌فرض برنگردد.
    contactSocialIntro: this.contactSocialIntro ?? "",
    contactSocials: this.contactSocials || "",
    contactPhone: this.contactPhone ?? "",
    contactEmail: this.contactEmail ?? "",
    contactAddress: this.contactAddress ?? "",
    contactHours: this.contactHours ?? "",
    // این‌ها هم ممکن است عمداً خالی باشند، پس ?? نه ||
    footerGuaranteeTitle: this.footerGuaranteeTitle ?? "",
    footerGuarantees: this.footerGuarantees ?? "",
    paymentsDisabled: this.paymentsDisabled === "1" ? "1" : "",
    paymentsDisabledNote: this.paymentsDisabledNote ?? "",
    zarinpalAutoVerify: this.zarinpalAutoVerify === "1" ? "1" : "",
    // قوانین و مقررات — ?? تا مقدار عمداً خالی ادمین حفظ شود.
    termsTitle: this.termsTitle ?? "",
    termsText: this.termsText ?? "",
    // پیامک‌ها — ?? تا مقدار عمداً خالیِ ادمین حفظ شود.
    smsirLine: this.smsirLine ?? "",
    smsirTemplateId: this.smsirTemplateId ?? "",
    smsirOtpParam: this.smsirOtpParam || DEFAULT_SETTINGS.smsirOtpParam,
    // تنها رشتهٔ خالیِ صریح غیرفعال می‌کند — سندهای قدیمی فاقد فیلد = فعال.
    smsOtpEnabled: this.smsOtpEnabled === "" ? "" : "1",
    smsirOrderPlacedTemplate: this.smsirOrderPlacedTemplate ?? "",
    smsirAdminOrderTemplate: this.smsirAdminOrderTemplate ?? "",
    smsirOrderStatusTemplate: this.smsirOrderStatusTemplate ?? "",
    smsirOrderPlacedParams: this.smsirOrderPlacedParams || DEFAULT_SETTINGS.smsirOrderPlacedParams,
    smsirAdminOrderParams: this.smsirAdminOrderParams || DEFAULT_SETTINGS.smsirAdminOrderParams,
    smsirOrderStatusParams: this.smsirOrderStatusParams || DEFAULT_SETTINGS.smsirOrderStatusParams,
    smsOrderPlacedEnabled: this.smsOrderPlacedEnabled === "1" ? "1" : "",
    smsAdminNotifyEnabled: this.smsAdminNotifyEnabled === "1" ? "1" : "",
    smsOrderStatusEnabled: this.smsOrderStatusEnabled === "1" ? "1" : "",
    abandonedCartEnabled: this.abandonedCartEnabled === "1" ? "1" : "",
    abandonedCartFirstHours: this.abandonedCartFirstHours ?? "2",
    abandonedCartSecondHours: this.abandonedCartSecondHours ?? "12",
    smsirAbandonedFirstTemplate: this.smsirAbandonedFirstTemplate ?? "",
    smsirAbandonedSecondTemplate: this.smsirAbandonedSecondTemplate ?? "",
    smsirAbandonedFirstParams: this.smsirAbandonedFirstParams || DEFAULT_SETTINGS.smsirAbandonedFirstParams,
    smsirAbandonedSecondParams: this.smsirAbandonedSecondParams || DEFAULT_SETTINGS.smsirAbandonedSecondParams,
    smsAbandonedFirstEnabled: this.smsAbandonedFirstEnabled === "1" ? "1" : "",
    smsAbandonedSecondEnabled: this.smsAbandonedSecondEnabled === "1" ? "1" : "",
    smsirCancelAdminTemplate: this.smsirCancelAdminTemplate ?? "",
    smsirCancelAdminParams: this.smsirCancelAdminParams || DEFAULT_SETTINGS.smsirCancelAdminParams,
    smsCancelAdminEnabled: this.smsCancelAdminEnabled === "1" ? "1" : "",
    emailAdmin: this.emailAdmin ?? "",
    emailOtpEnabled: this.emailOtpEnabled === "" ? "" : "1",
    emailOrderPlacedEnabled: this.emailOrderPlacedEnabled === "1" ? "1" : "",
    emailAdminNotifyEnabled: this.emailAdminNotifyEnabled === "1" ? "1" : "",
    emailOrderStatusEnabled: this.emailOrderStatusEnabled === "1" ? "1" : "",
    emailAbandonedFirstEnabled: this.emailAbandonedFirstEnabled === "1" ? "1" : "",
    emailAbandonedSecondEnabled: this.emailAbandonedSecondEnabled === "1" ? "1" : "",
    emailCancelAdminEnabled: this.emailCancelAdminEnabled === "1" ? "1" : "",
    // شمارهٔ شخصی مدیر فقط در پاسخ به پنل ادمین برمی‌گردد، نه DTO عمومی.
    // v40: کدهای تخفیف فقط برای پنل ادمین — اگر در DTO عمومی بود، هر
    // مشتری‌ای می‌توانست با یک curl کدهای فعال را از /api/settings بدزدد.
    ...(includePrivate
      ? {
          smsAdminPhone: this.smsAdminPhone ?? "",
          emailAdmin: this.emailAdmin ?? "",
          couponEnabled: this.couponEnabled === "1" ? "1" : "",
          couponCodesJson: this.couponCodesJson || "[]",
        }
      : {}),
  };
};

const Settings = mongoose.model("Settings", settingsSchema);
export default Settings;
