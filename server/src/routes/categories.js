import { Router } from "express";
import Category, { buildTree } from "../models/Category.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";

/**
 * GET /api/categories — درخت عمومی دسته‌بندی‌ها (فقط گره‌های فعال).
 * فروشگاه و صفحهٔ محصول از این خروجی برای فیلتر/نمایش درختی استفاده می‌کنند.
 * `flat` هم کنارش برمی‌گردد تا کلاینت بدون پیمایش درخت، id→نام را نگاشت کند.
 */
const router = Router();

router.get(
  "/",
  rateLimit({ name: "categories-read", windowMs: 60 * 1000, max: 120 }),
  ah(async (_req, res) => {
    const rows = await Category.find({ active: true }).sort({ order: 1, id: 1 }).lean();
    const flat = rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId ?? null,
      order: r.order ?? 0,
      icon: r.icon || "",
    }));
    res.set("Cache-Control", "no-store");
    res.json({ categories: buildTree(flat), flat });
  }),
);

export default router;
