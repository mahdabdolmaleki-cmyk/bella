import { Router } from "express";
import Product from "../models/Product.js";
import AbandonedCart from "../models/AbandonedCart.js";
import { optionalUser } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { int } from "../utils/validate.js";

const router = Router();

// کاربر مهمان هم می‌تواند سبد داشته باشد اما بدون شماره پیامک ندارد — فقط لاگین‌شده‌ها ذخیره می‌شوند
router.post(
  "/track",
  rateLimit({ name: "cart-track", windowMs: 60 * 1000, max: 60 }),
  optionalUser,
  ah(async (req, res) => {
    // تلاش برای خواندن کاربر از توکن (اگر موجود باشد)
    // چون این روتر قبلاً احراز هویت اجباری ندارد، از خود authMiddleware کمک می‌گیریم
    // اگر کاربر لاگین نباشد، چیزی ذخیره نمی‌کنیم
    const user = req.user || null;

    // اگر کاربر لاگین نیست، فقط ok برمی‌گردانیم (پیامک بدون شماره ممکن نیست)
    // اما اگر شماره در بدنه آمده باشد (مهمان با شماره)، می‌توانیم ذخیره کنیم — فعلاً فقط لاگین
    if (!user) {
      return res.json({ ok: true, tracked: false });
    }

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length === 0) {
      // سبد خالی شد → کارت رها شده را حذف کن یا converted کن
      await AbandonedCart.deleteOne({ user: user._id, converted: false }).catch(() => {});
      return res.json({ ok: true, cleared: true });
    }

    // فقط id و qty از کلاینت می‌آید — قیمت و نام از دیتابیس
    const wanted = new Map();
    for (const it of rawItems) {
      const id = int(it?.id, { min: 1, max: 1e9 });
      const qty = int(it?.qty, { min: 1, max: 99, fallback: 1 }) || 1;
      if (id === null) continue;
      wanted.set(id, Math.min(99, (wanted.get(id) || 0) + qty));
    }
    if (wanted.size === 0) {
      await AbandonedCart.deleteOne({ user: user._id, converted: false }).catch(() => {});
      return res.json({ ok: true, cleared: true });
    }

    const products = await Product.find({ id: { $in: [...wanted.keys()] }, active: true });
    if (products.length === 0) {
      await AbandonedCart.deleteOne({ user: user._id, converted: false }).catch(() => {});
      return res.json({ ok: true, cleared: true });
    }

    const items = products.map((p) => ({
      id: p.id,
      name: p.name,
      qty: wanted.get(p.id) || 1,
      price: p.price,
      image: p.image || null,
    }));
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

    // اگر کاربر قبلاً سفارش داده و سبد را خالی کرده، کارت قدیمی converted شده است — یکی جدید بساز
    await AbandonedCart.findOneAndUpdate(
      { user: user._id, converted: false },
      {
        $set: {
          phone: user.phone || "",
          email: user.email || "",
          name: user.name || "",
          items,
          subtotal,
          lastUpdated: new Date(),
        },
        $setOnInsert: {
          firstSent: false,
          secondSent: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ ok: true, tracked: true });
  })
);

// برای تست ادمین: لیست سبدهای رها شده
import { requireAdmin } from "../middleware/authMiddleware.js";
router.get(
  "/abandoned",
  requireAdmin,
  ah(async (_req, res) => {
    const carts = await AbandonedCart.find({ converted: false })
      .sort({ lastUpdated: -1 })
      .limit(100);
    res.json({ carts });
  })
);

export default router;
