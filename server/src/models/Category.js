import mongoose from "mongoose";
import Counter from "./Counter.js";

/**
 * دسته‌بندی درختی محصولات.
 * به‌جای ذخیرهٔ درخت تو در تو، هر گره تخت ذخیره می‌شود و `parentId` به پدرش
 * اشاره می‌کند. درخت موقع نیاز سمت سرور مونتاژ می‌شود (`buildTree`).
 * این مدل ساده‌تر، امن‌تر (جلوگیری از حلقه) و راحت‌تر برای ویرایش ادمین است.
 */
const categorySchema = new mongoose.Schema(
  {
    // شناسهٔ عددی خوانا که در URL و اتصال محصول استفاده می‌شود.
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    // پدر این گره؛ null یعنی ریشه.
    parentId: { type: Number, default: null, index: true },
    // ترتیب نمایش بین هم‌سطح‌ها.
    order: { type: Number, default: 0 },
    // گره‌های غیرفعال در فروشگاه نمایش داده نمی‌شوند اما در ادمین می‌مانند.
    active: { type: Boolean, default: true },
    // آیکن اختیاری (نام آیکن فرانت).
    icon: { type: String, default: "" },
  },
  { timestamps: true },
);

categorySchema.methods.toDTO = function () {
  return {
    id: this.id,
    name: this.name,
    parentId: this.parentId ?? null,
    order: this.order ?? 0,
    active: this.active !== false,
    icon: this.icon || "",
  };
};

/**
 * از لیست تخت گره‌ها، درخت تو در تو می‌سازد.
 * گره‌هایی که پدرشان پیدا نشود (یتیم/خراب) به‌عنوان ریشه رفتار می‌کنند تا
 * یک دادهٔ نیمه‌خراب کل درخت را نابود نکند.
 */
export function buildTree(list) {
  const byId = new Map(list.map((n) => [n.id, { ...n, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parentId != null ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (arr) => {
    arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
    arr.forEach((x) => sortRec(x.children));
  };
  sortRec(roots);
  return roots;
}

/**
 * شناسهٔ خود گره + همهٔ نوادگانش (برای فیلتر «این شاخه و زیرشاخه‌ها»).
 * نسبت به حلقهٔ تصادفی (parentId چرخه‌ای) مقاوم است چون هر گره فقط یک‌بار دیده می‌شود.
 */
export function descendantIds(list, rootId) {
  const childrenByParent = new Map();
  for (const n of list) {
    const p = n.parentId ?? null;
    if (!childrenByParent.has(p)) childrenByParent.set(p, []);
    childrenByParent.get(p).push(n.id);
  }
  const out = [];
  const seen = new Set();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    for (const c of childrenByParent.get(cur) || []) stack.push(c);
  }
  return out;
}

categorySchema.statics.nextId = async function () {
  const doc = await Counter.findByIdAndUpdate(
    { _id: "categories" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return doc.seq;
};

const Category = mongoose.models.Category || mongoose.model("Category", categorySchema);
export default Category;
