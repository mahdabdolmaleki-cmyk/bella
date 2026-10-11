import { Router } from "express";
import Category, { buildTree, descendantIds } from "../models/Category.js";
import Product from "../models/Product.js";
import { requireAdmin } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, int, bool } from "../utils/validate.js";

/**
 * CRUD دسته‌بندی درختی — مخصوص پنل ادمین.
 * همهٔ مسیرها requireAdmin دارند (ماونت زیر /api/admin/categories).
 */
const router = Router();
router.use(requireAdmin);
router.use(rateLimit({ name: "admin-categories", windowMs: 60 * 1000, max: 120 }));

const MAX_DEPTH = 5; // عمق معقول برای یک فروشگاه عطر؛ جلوی درخت‌های بیمار را می‌گیرد

async function allList() {
  const rows = await Category.find().sort({ order: 1, id: 1 }).lean();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    parentId: r.parentId ?? null,
    order: r.order ?? 0,
    active: r.active !== false,
    icon: r.icon || "",
  }));
}

function depthOf(list, id) {
  const byId = new Map(list.map((n) => [n.id, n]));
  let d = 0;
  let cur = byId.get(id);
  const seen = new Set();
  while (cur && cur.parentId != null && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parentId);
    d++;
  }
  return d;
}

// GET /api/admin/categories — درخت + تعداد محصول هر گره
router.get(
  "/",
  ah(async (_req, res) => {
    const flat = await allList();
    const counts = await Product.aggregate([
      { $match: { categoryId: { $ne: null } } },
      { $group: { _id: "$categoryId", n: { $sum: 1 } } },
    ]);
    const countBy = new Map(counts.map((c) => [c._id, c.n]));
    const withCount = flat.map((n) => ({ ...n, productCount: countBy.get(n.id) || 0 }));
    res.json({ categories: buildTree(withCount), flat: withCount });
  }),
);

// POST /api/admin/categories — ساخت گره
router.post(
  "/",
  ah(async (req, res) => {
    const name = str(req.body?.name, { max: 60 });
    if (!name) return res.status(400).json({ error: "نام دسته الزامی است." });

    const list = await allList();
    const parentIdRaw = req.body?.parentId;
    const parentId =
      parentIdRaw === null || parentIdRaw === undefined || parentIdRaw === ""
        ? null
        : int(parentIdRaw, { min: 1, max: 1e9, clamp: false });
    if (parentId !== null && !list.some((n) => n.id === parentId)) {
      return res.status(400).json({ error: "دستهٔ پدر پیدا نشد." });
    }
    if (parentId !== null && depthOf(list, parentId) + 1 >= MAX_DEPTH) {
      return res.status(400).json({ error: `حداکثر عمق دسته‌ها ${MAX_DEPTH} است.` });
    }

    const siblings = list.filter((n) => n.parentId === parentId);
    const order = int(req.body?.order, { min: 0, max: 9999, fallback: siblings.length });

    const doc = await Category.create({
      id: await Category.nextId(),
      name,
      parentId,
      order,
      active: req.body?.active === undefined ? true : bool(req.body.active),
      icon: str(req.body?.icon, { max: 40 }),
    });
    logActivity(req, { action: "category.create", target: name, status: 201 });
    res.status(201).json({ category: doc.toDTO() });
  }),
);

// PUT /api/admin/categories/:id — ویرایش (نام/ترتیب/فعال/آیکن/پدر)
router.put(
  "/:id",
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9, clamp: false });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });
    const doc = await Category.findOne({ id });
    if (!doc) return res.status(404).json({ error: "دسته پیدا نشد." });

    const list = await allList();

    if (req.body?.name !== undefined) {
      const name = str(req.body.name, { max: 60 });
      if (!name) return res.status(400).json({ error: "نام دسته الزامی است." });
      doc.name = name;
    }
    if (req.body?.order !== undefined)
      doc.order = int(req.body.order, { min: 0, max: 9999, fallback: doc.order });
    if (req.body?.active !== undefined) doc.active = bool(req.body.active);
    if (req.body?.icon !== undefined) doc.icon = str(req.body.icon, { max: 40 });

    if (req.body?.parentId !== undefined) {
      const raw = req.body.parentId;
      const parentId = raw === null || raw === "" ? null : int(raw, { min: 1, max: 1e9, clamp: false });
      if (parentId !== null) {
        if (parentId === id)
          return res.status(400).json({ error: "یک دسته نمی‌تواند پدر خودش باشد." });
        const desc = new Set(descendantIds(list, id));
        if (desc.has(parentId))
          return res.status(400).json({ error: "این جابه‌جایی یک حلقه می‌سازد." });
        if (depthOf(list, parentId) + 1 >= MAX_DEPTH) {
          return res.status(400).json({ error: `حداکثر عمق دسته‌ها ${MAX_DEPTH} است.` });
        }
      }
      doc.parentId = parentId;
    }

    await doc.save();

    // همگام‌سازی نام نمایشی محصولاتی که مستقیم به این گره وصل‌اند.
    if (req.body?.name !== undefined) {
      await Product.updateMany({ categoryId: id }, { $set: { category: doc.name } });
    }

    logActivity(req, { action: "category.update", target: doc.name, status: 200 });
    res.json({ category: doc.toDTO() });
  }),
);

// POST /api/admin/categories/reorder — جابه‌جایی/ترتیب دسته‌ای
router.post(
  "/reorder",
  ah(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "موردی ارسال نشده." });
    for (const item of items.slice(0, 200)) {
      const id = int(item?.id, { min: 1, max: 1e9, clamp: false });
      if (id === null) continue;
      const update = {};
      if (item?.order !== undefined) update.order = int(item.order, { min: 0, max: 9999, fallback: 0 });
      if (Object.keys(update).length) await Category.updateOne({ id }, { $set: update });
    }
    res.json({ ok: true });
  }),
);

// DELETE /api/admin/categories/:id — حذف با بالاآوردن فرزندان و محصولات
router.delete(
  "/:id",
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9, clamp: false });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });
    const doc = await Category.findOne({ id });
    if (!doc) return res.status(404).json({ error: "دسته پیدا نشد." });

    const parentId = doc.parentId ?? null;
    // فرزندان به پدرِ این گره وصل می‌شوند تا چیزی یتیم نشود.
    await Category.updateMany({ parentId: id }, { $set: { parentId } });

    // محصولات این گره به پدر منتقل می‌شوند (و نام نمایشی‌شان هم‌نام پدر می‌شود).
    let parentName = null;
    if (parentId !== null) {
      const parent = await Category.findOne({ id: parentId });
      parentName = parent?.name || null;
    }
    await Product.updateMany(
      { categoryId: id },
      { $set: { categoryId: parentId, ...(parentName ? { category: parentName } : {}) } },
    );

    await Category.deleteOne({ id });
    logActivity(req, { action: "category.delete", target: doc.name, status: 200 });
    res.json({ ok: true });
  }),
);

export default router;
