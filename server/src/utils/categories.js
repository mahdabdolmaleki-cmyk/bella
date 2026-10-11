import Category from "../models/Category.js";
import Product from "../models/Product.js";

/**
 * ساخت دسته‌بندی پایهٔ درختی (یک‌بار، idempotent).
 * ریشه‌ها: «ادکلن» و «دکانت». دسته‌های قدیمی زنانه/مردانه/یونیسکس زیر «ادکلن»
 * می‌روند و محصولاتی که هنوز با «نام» دسته ذخیره شده‌اند به «شناسهٔ» گره وصل می‌شوند.
 * چون هر بار چک می‌کند، اجرای دوباره چیزی را duplicat نمی‌کند.
 */
export async function bootstrapCategories() {
  const existing = await Category.countDocuments();
  if (existing > 0) return; // قبلاً ساخته شده

  const mk = async (name, parentId, order) => {
    const id = await Category.nextId();
    const doc = await Category.create({ id, name, parentId, order, active: true });
    return doc.id;
  };

  const cologne = await mk("ادکلن", null, 0);
  const decant = await mk("دکانت", null, 1);
  const woman = await mk("زنانه", cologne, 0);
  const man = await mk("مردانه", cologne, 1);
  const unisex = await mk("یونیسکس", cologne, 2);

  // مهاجرت محصولات قدیمی: نام دسته → شناسهٔ گره.
  const map = { زنانه: woman, مردانه: man, یونیسکس: unisex };
  for (const [name, catId] of Object.entries(map)) {
    await Product.updateMany(
      { category: name, categoryId: { $in: [null, undefined] } },
      { $set: { categoryId: catId } },
    );
  }

  console.log("✓ دسته‌بندی پایه (ادکلن/دکانت) ساخته شد");
  console.log("✓ محصولات قدیمی به دستهٔ درختی وصل شدند");
}
