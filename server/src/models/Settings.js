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
};

// Numeric settings are validated with num() instead of str() in the admin PUT.
export const NUMERIC_SETTINGS = {
  tomanPerPoint: { min: 1, max: 100000000 },
  tierGoldSpend: { min: 0, max: 1e12 },
  tierDiamondSpend: { min: 0, max: 1e12 },
  shippingFreeThreshold: { min: 0, max: 1e12 },
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
  footerAbout: { type: String, default: DEFAULT_SETTINGS.footerAbout, maxlength: 1000 },
  tomanPerPoint: { type: Number, default: DEFAULT_SETTINGS.tomanPerPoint, min: 1 },
  tierGoldSpend: { type: Number, default: DEFAULT_SETTINGS.tierGoldSpend, min: 0 },
  tierDiamondSpend: { type: Number, default: DEFAULT_SETTINGS.tierDiamondSpend, min: 0 },
  shippingFreeThreshold: {
    type: Number,
    default: DEFAULT_SETTINGS.shippingFreeThreshold,
    min: 0,
  },
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

settingsSchema.methods.toDTO = function () {
  return {
    // Missing fields belong to legacy documents and mean "enabled". Only an
    // explicit empty string, written by the admin toggle, disables a method.
    loginPhoneEnabled: this.loginPhoneEnabled === "" ? "" : "1",
    loginEmailEnabled: this.loginEmailEnabled === "" ? "" : "1",
    festivalActive: this.festivalActive,
    festivalTitle: this.festivalTitle,
    festivalSubtitle: this.festivalSubtitle,
    footerAbout: this.footerAbout,
    tomanPerPoint: String(this.tomanPerPoint ?? DEFAULT_SETTINGS.tomanPerPoint),
    tierGoldSpend: String(this.tierGoldSpend ?? DEFAULT_SETTINGS.tierGoldSpend),
    tierDiamondSpend: String(this.tierDiamondSpend ?? DEFAULT_SETTINGS.tierDiamondSpend),
    shippingFreeThreshold: String(
      this.shippingFreeThreshold ?? DEFAULT_SETTINGS.shippingFreeThreshold
    ),
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
    contactAddress: this.contactAddress ?? "",
    contactHours: this.contactHours ?? "",
    // این‌ها هم ممکن است عمداً خالی باشند، پس ?? نه ||
    footerGuaranteeTitle: this.footerGuaranteeTitle ?? "",
    footerGuarantees: this.footerGuarantees ?? "",
    paymentsDisabled: this.paymentsDisabled === "1" ? "1" : "",
    paymentsDisabledNote: this.paymentsDisabledNote ?? "",
  };
};

const Settings = mongoose.model("Settings", settingsSchema);
export default Settings;
