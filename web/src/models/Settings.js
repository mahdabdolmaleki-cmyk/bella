import mongoose from "mongoose";

export const DEFAULT_SETTINGS = {
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
};

// Numeric settings are validated with num() instead of str() in the admin PUT.
export const NUMERIC_SETTINGS = {
  tomanPerPoint: { min: 1, max: 100000000 },
  tierGoldSpend: { min: 0, max: 1e12 },
  tierDiamondSpend: { min: 0, max: 1e12 },
};

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: "site", unique: true },
  festivalActive: { type: String, default: DEFAULT_SETTINGS.festivalActive },
  festivalTitle: { type: String, default: DEFAULT_SETTINGS.festivalTitle, maxlength: 120 },
  festivalSubtitle: { type: String, default: DEFAULT_SETTINGS.festivalSubtitle, maxlength: 200 },
  footerAbout: { type: String, default: DEFAULT_SETTINGS.footerAbout, maxlength: 1000 },
  tomanPerPoint: { type: Number, default: DEFAULT_SETTINGS.tomanPerPoint, min: 1 },
  tierGoldSpend: { type: Number, default: DEFAULT_SETTINGS.tierGoldSpend, min: 0 },
  tierDiamondSpend: { type: Number, default: DEFAULT_SETTINGS.tierDiamondSpend, min: 0 },
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
    festivalActive: this.festivalActive,
    festivalTitle: this.festivalTitle,
    festivalSubtitle: this.festivalSubtitle,
    footerAbout: this.footerAbout,
    tomanPerPoint: String(this.tomanPerPoint ?? DEFAULT_SETTINGS.tomanPerPoint),
    tierGoldSpend: String(this.tierGoldSpend ?? DEFAULT_SETTINGS.tierGoldSpend),
    tierDiamondSpend: String(this.tierDiamondSpend ?? DEFAULT_SETTINGS.tierDiamondSpend),
    journeyStages: this.journeyStages || "",
    journeyBottleGlass: this.journeyBottleGlass || DEFAULT_SETTINGS.journeyBottleGlass,
    journeyBottleLiquid: this.journeyBottleLiquid || DEFAULT_SETTINGS.journeyBottleLiquid,
    journeyBottleImage: this.journeyBottleImage || "",
    homeBrands: this.homeBrands || "",
    sectionIcons: this.sectionIcons || "",
    homeFeatures: this.homeFeatures || "",
  };
};

const Settings = mongoose.model("Settings", settingsSchema);
export default Settings;
