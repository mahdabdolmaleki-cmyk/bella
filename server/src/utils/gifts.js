import Product from "../models/Product.js";

// آیا این محصول قابلیتِ انتخاب به‌عنوان هدیه را دارد؟ (فعال + موجود)
export const giftInStock = (p) =>
  Boolean(p && p.active !== false && (p.allowBackorder || (p.stock ?? 0) >= 1));

// هدیهٔ دیفالت: ارزان‌ترین محصولِ فعالِ موجود. آخرین خطِ دفاعی تا خریدِ
// مشتریِ مشمول هرگز بدون هدیه نماند (وقتی ادمین هدیه‌ای علامت نزده یا
// همهٔ هدیه‌های علامت‌خورده ناموجود شده‌اند).
export async function defaultGiftProduct() {
  return Product.findOne({
    active: true,
    $or: [{ stock: { $gte: 1 } }, { allowBackorder: true }],
  })
    .sort({ price: 1, id: 1 })
    .lean();
}

/**
 * استخرِ هدایای وفاداری: محصولاتِ فعالِ gift=true (به ترتیب id، حداکثر ۲۰).
 * اگر ادمین هیچ محصولی را به‌عنوان هدیه علامت نزده باشد، همان «هدیهٔ
 * دیفالت» برگردانده می‌شود تا مشتریِ مشمولِ هدیه همیشه حداقل یک گزینه
 * داشته باشد و خریدِ با هدیه هرگز خالی نماند.
 */
export async function giftPoolProducts() {
  const gifts = await Product.find({ active: true, gift: true })
    .sort({ id: 1 })
    .limit(20)
    .lean();
  if (gifts.length === 0) {
    const fb = await defaultGiftProduct();
    return fb ? [fb] : [];
  }
  return gifts;
}
