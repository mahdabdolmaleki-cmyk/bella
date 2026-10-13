export type ProductDescriptionBlock = {
  type: "text" | "image" | "video";
  text: string;
  /** سرتیتر اختیاری بلوک متن — بالای باکس پاراگراف اول نمایش داده می‌شود. */
  heading?: string;
  src: string;
};

export type ProductDTO = {
  id: number;
  name: string;
  nameEn: string;
  /** نوع محصول: ادکلن/عطر یا سایر محصولات (خوشبوکننده، اسپری و…). */
  productType?: "perfume" | "general";
  /** زیرنوعِ محصولاتِ «سایر» — مثلاً «خوشبوکننده»، «اسپری»، «خوشبوکنندهٔ خودرو». */
  subType?: string;
  tagline: string;
  description: string;
  topNotes: string;
  heartNotes: string;
  baseNotes: string;
  longevity: string;
  sillage: string;
  price: number;
  oldPrice: number | null;
  sizeMl: number;
  glass: string;
  liquid: string;
  category: string;
  /** شناسهٔ گرهٔ دستهٔ درختی که محصول به آن وصل است. */
  categoryId?: number | null;
  /** عضویت در کمپین جشنواره / تخفیف (ادمین تعیین می‌کند). */
  festival?: boolean;
  discount?: boolean;
  /** قابل انتخاب به‌عنوان هدیهٔ وفاداری هنگامِ پرداخت. */
  gift?: boolean;
  /** نوع تخفیف اعمال‌شده: "percent" | "amount" | "" و مقدار آن (درصد یا تومان). */
  discountType?: "" | "percent" | "amount";
  discountValue?: number | null;
  badge: string | null;
  bestseller: boolean;
  active: boolean;
  image: string | null;
  // Availability flag only — the real stock number is admin-only.
  inStock?: boolean;
  // Specification sheet rendered in the "ویژگی‌های محصول" tab. Every row is
  // optional and hidden when empty.
  brand?: string;
  manufacturer?: string;
  suitableFor?: string;
  concentration?: string;
  originCountry?: string;
  madeIn?: string;
  scentType?: string;
  scentStructure?: string;
  season?: string;
  // Ordered rich content for the "توضیحات" tab. Legacy fields remain optional
  // so products saved before the block editor continue to render unchanged.
  descriptionBlocks?: ProductDescriptionBlock[];
  // نمادها و متن‌های ویژهٔ صفحهٔ محصول — آیکن از پکیج /icons + متن کوتاه.
  highlights?: ProductHighlight[];
  // ویژگی‌های دلخواه (برچسب + مقدار) که ادمین در فرم محصول اضافه/حذف می‌کند و
  // در تب «ویژگی‌های محصول» نمایش داده می‌شوند.
  attributes?: ProductAttribute[];
  longDescription?: string;
  gallery?: string[];
};

export type ProductHighlight = {
  icon: string;
  text: string;
};

/** ویژگیِ دلخواه (برچسب + مقدار) که ادمین در فرم محصول اضافه/حذف می‌کند. */
export type ProductAttribute = {
  label: string;
  value: string;
};

// NOTE: the old SEED_PRODUCTS constant lived here. It duplicated the real
// catalogue (server/src/seed.js), was never imported anywhere, and shipped
// ~130 lines of stale product data to every browser. Removed.

export const formatToman = (n: number) =>
  n.toLocaleString("fa-IR") + " تومان";

export const toFa = (n: number | string) =>
  String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
