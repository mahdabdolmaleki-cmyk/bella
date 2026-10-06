import mongoose from "mongoose";
import { nextSequence } from "./Counter.js";
import { stripInvisible } from "../utils/validate.js";

export const PRODUCT_DESCRIPTION_BLOCK_TYPES = ["text", "image", "video"];

// نمادهای مجاز صفحهٔ محصول: نام فایل آیکن از پکیج خودمان (a-z, 0-9, خط تیره).
export const PRODUCT_HIGHLIGHT_MAX = 8;

const highlightSchema = new mongoose.Schema(
  {
    // نام آیکن از پکیج /icons (مثل truck، shield-check، zap).
    icon: { type: String, default: "sparkles", maxlength: 40 },
    // متن کنار آیکن — مثلاً «ارسال فوری تهران» یا «ضمانت اصالت».
    text: { type: String, default: "", maxlength: 90 },
  },
  { _id: false },
);

const descriptionBlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: PRODUCT_DESCRIPTION_BLOCK_TYPES,
      default: "text",
    },
    // Main copy for text blocks; optional caption for image/video blocks.
    text: { type: String, default: "", maxlength: 6000 },
    // سرتیتر اختیاری بلوک — بالای باکسِ پاراگراف اول نمایش داده می‌شود.
    heading: { type: String, default: "", maxlength: 120 },
    // Uploaded image or video path. HTML is never accepted or stored.
    src: { type: String, default: "", maxlength: 600 },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true }, // unique already builds the index
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameEn: { type: String, required: true, trim: true, maxlength: 120 },
    tagline: { type: String, default: "", maxlength: 200 },
    description: { type: String, default: "", maxlength: 2000 },
    topNotes: { type: String, default: "", maxlength: 200 },
    heartNotes: { type: String, default: "", maxlength: 200 },
    baseNotes: { type: String, default: "", maxlength: 200 },
    longevity: { type: String, default: "", maxlength: 60 },
    sillage: { type: String, default: "", maxlength: 60 },
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, default: null },
    sizeMl: { type: Number, default: 100, min: 1, max: 10000 },
    glass: { type: String, default: "#0e3b26" },
    liquid: { type: String, default: "#d4af37" },
    category: { type: String, default: "یونیسکس", index: true },
    badge: { type: String, default: null },
    bestseller: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    image: { type: String, default: null },
    // Inventory. Never exposed to customers — see toDTO() vs toAdminDTO().
    stock: { type: Number, default: 0, min: 0, max: 1000000 },
    // When true the product can be ordered even with stock = 0.
    allowBackorder: { type: Boolean, default: false },

    // ---- Specification sheet (جدول "ویژگی‌های محصول") -------------------------------
    // Every row is optional: an empty value is simply hidden on the product
    // page instead of rendering a blank table row.
    brand: { type: String, default: "", maxlength: 80 },          // برند سازنده
    manufacturer: { type: String, default: "", maxlength: 80 },   // شرکت سازنده
    suitableFor: { type: String, default: "", maxlength: 40 },     // مناسب برای
    concentration: { type: String, default: "", maxlength: 40 },   // نوع غلظت
    originCountry: { type: String, default: "", maxlength: 60 },   // کشور مبدأ برند
    madeIn: { type: String, default: "", maxlength: 60 },          // کشور سازنده
    scentType: { type: String, default: "", maxlength: 120 },      // نوع رایحه
    scentStructure: { type: String, default: "", maxlength: 160 }, // ساختار رایحه
    season: { type: String, default: "", maxlength: 80 },          // فصل پیشنهادی
    // Ordered rich content for the "توضیحات" tab. Text, uploaded images and
    // uploaded videos can be interleaved without accepting unsafe raw HTML.
    descriptionBlocks: {
      type: [descriptionBlockSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 40,
        message: "حداکثر ۴۰ بلوک توضیحات مجاز است.",
      },
    },
    // نمادها و متن‌های ویژه‌ای که ادمین برای هر محصول در فرم انتخاب می‌کند و
    // در صفحهٔ محصول (کنار دکمهٔ خرید) به‌صورت آیکن + متن نمایش داده می‌شوند.
    highlights: {
      type: [highlightSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= PRODUCT_HIGHLIGHT_MAX,
        message: "حداکثر ۸ نماد برای هر محصول مجاز است.",
      },
    },
    // Legacy fields are retained only so existing MongoDB data remains readable
    // until that product is edited and migrated to descriptionBlocks.
    longDescription: { type: String, default: "", maxlength: 6000 },
    // Gallery: عکس‌های اضافهٔ محصول که در صفحهٔ فروشگاه به‌صورت گالری
    // (تصویر اصلی + بندانگشتی‌ها) نمایش داده می‌شوند — حداکثر ۱۰ عکس.
    gallery: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: "حداکثر ۱۰ تصویر در گالری مجاز است.",
      },
    },
  },
  { timestamps: true },
);

productSchema.pre("save", async function () {
  if (this.id == null) this.id = await nextSequence("product");
});

// PUBLIC DTO — deliberately contains NO stock numbers. Customers only see a
// boolean availability flag, never how many units are left.
productSchema.methods.toDTO = function () {
  const clean = (v) => stripInvisible(v || "");
  return {
    id: this.id,
    name: clean(this.name),
    nameEn: clean(this.nameEn),
    tagline: clean(this.tagline),
    description: clean(this.description),
    topNotes: clean(this.topNotes),
    heartNotes: clean(this.heartNotes),
    baseNotes: clean(this.baseNotes),
    longevity: clean(this.longevity),
    sillage: clean(this.sillage),
    price: this.price,
    oldPrice: this.oldPrice ?? null,
    sizeMl: this.sizeMl,
    glass: this.glass,
    liquid: this.liquid,
    category: clean(this.category),
    badge: this.badge != null ? clean(this.badge) : null,
    bestseller: this.bestseller,
    active: this.active,
    image: this.image ?? null,
    inStock: this.allowBackorder || this.stock > 0,
    // Specification sheet
    brand: clean(this.brand),
    manufacturer: clean(this.manufacturer),
    suitableFor: clean(this.suitableFor),
    concentration: clean(this.concentration),
    originCountry: clean(this.originCountry),
    madeIn: clean(this.madeIn),
    scentType: clean(this.scentType),
    scentStructure: clean(this.scentStructure),
    season: clean(this.season),
    // BUG FIX: متن بلوک‌ها هنگام خواندن هم از نویسه‌های نامرئی (کپی‌شده از
    // Word/تلگرام) پاک می‌شود تا دیتای قدیمی هم درست رندر شود.
    descriptionBlocks: Array.isArray(this.descriptionBlocks)
      ? this.descriptionBlocks.map((block) => ({
          type: block.type,
          text: clean(block.text),
          heading: clean(block.heading),
          src: block.src || "",
        }))
      : [],
    // نمادهای صفحهٔ محصول — متن هم مثل بقیهٔ متن‌ها از نویسه‌های نامرئی پاک می‌شود.
    highlights: Array.isArray(this.highlights)
      ? this.highlights
          .map((h) => ({ icon: h.icon || "sparkles", text: clean(h.text) }))
          .filter((h) => h.text)
      : [],
    longDescription: clean(this.longDescription),
    gallery: Array.isArray(this.gallery) ? this.gallery.filter(Boolean) : [],
  };
};

// ADMIN DTO — same as the public one plus the inventory fields.
productSchema.methods.toAdminDTO = function () {
  return {
    ...this.toDTO(),
    stock: this.stock ?? 0,
    allowBackorder: Boolean(this.allowBackorder),
  };
};

const Product = mongoose.model("Product", productSchema);
export default Product;
