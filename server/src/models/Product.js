import mongoose from "mongoose";
import { nextSequence } from "./Counter.js";

export const PRODUCT_DESCRIPTION_BLOCK_TYPES = ["text", "image", "video"];

const descriptionBlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: PRODUCT_DESCRIPTION_BLOCK_TYPES,
      default: "text",
    },
    // Main copy for text blocks; optional caption for image/video blocks.
    text: { type: String, default: "", maxlength: 6000 },
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
    // Legacy fields are retained only so existing MongoDB data remains readable
    // until that product is edited and migrated to descriptionBlocks.
    longDescription: { type: String, default: "", maxlength: 6000 },
    // Legacy extra photos shown as thumbnails under the main image (max 6).
    gallery: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 6,
        message: "حداکثر ۶ تصویر مجاز است.",
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
  return {
    id: this.id,
    name: this.name,
    nameEn: this.nameEn,
    tagline: this.tagline,
    description: this.description,
    topNotes: this.topNotes,
    heartNotes: this.heartNotes,
    baseNotes: this.baseNotes,
    longevity: this.longevity,
    sillage: this.sillage,
    price: this.price,
    oldPrice: this.oldPrice ?? null,
    sizeMl: this.sizeMl,
    glass: this.glass,
    liquid: this.liquid,
    category: this.category,
    badge: this.badge ?? null,
    bestseller: this.bestseller,
    active: this.active,
    image: this.image ?? null,
    inStock: this.allowBackorder || this.stock > 0,
    // Specification sheet
    brand: this.brand || "",
    manufacturer: this.manufacturer || "",
    suitableFor: this.suitableFor || "",
    concentration: this.concentration || "",
    originCountry: this.originCountry || "",
    madeIn: this.madeIn || "",
    scentType: this.scentType || "",
    scentStructure: this.scentStructure || "",
    season: this.season || "",
    descriptionBlocks: Array.isArray(this.descriptionBlocks)
      ? this.descriptionBlocks.map((block) => ({
          type: block.type,
          text: block.text || "",
          src: block.src || "",
        }))
      : [],
    longDescription: this.longDescription || "",
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
