import { Router } from "express";
import Product from "../models/Product.js";
import Settings from "../models/Settings.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { int } from "../utils/validate.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/gifts/eligible?total=<cartTotal>
//
// فیچر هدیهٔ زمان خرید: اگر ادمین هدیه را فعال کرده («giftEnabled» در تنظیمات)
// و مبلغ سبد به حد نصابِ «giftMinTotal» رسیده باشد، محصولاتِ علامت‌خوردهٔ
// isGift که موجودیِ واقعی دارند برمی‌گردد تا مشتری یکی را انتخاب کند.
//
// این مسیر فقط برای «نمایش» است؛ چک نهایی (فعال بودن + حد نصاب با مبلغِ
// محاسبه‌شدهٔ سمت سرور + کسر اتمیک موجودی) هنگام ثبت سفارش در routes/orders.js
// تکرار می‌شود، پس دور زدن این مسیر سودی برای کلاهبردار ندارد.
// ---------------------------------------------------------------------------
router.get(
  "/eligible",
  rateLimit({ name: "gifts-eligible", windowMs: 60 * 1000, max: 60 }),
  ah(async (req, res) => {
    const settings = await Settings.getSingleton();
    if (settings?.giftEnabled !== "1") {
      return res.json({ eligible: false, gifts: [] });
    }
    const total = int(req.query?.total, { min: 0, max: 1e12, clamp: false }) ?? 0;
    const minTotal = Math.max(0, Number(settings.giftMinTotal) || 0);
    if (total < minTotal) {
      return res.json({ eligible: false, gifts: [] });
    }
    // فقط محصولات فعالِ هدیه‌پذیر با موجودیِ واقعی — پیش‌سفارش (backorder)
    // برای هدیه معنا ندارد، چون قرار است همان لحظه همراه سفارش ارسال شود.
    const products = await Product.find({ active: true, isGift: true, stock: { $gt: 0 } })
      .sort({ id: 1 })
      .limit(24)
      .select("id name nameEn image glass liquid");
    res.json({
      eligible: true,
      // همان فیلدهایی که کامپوننت ProductVisual فروشگاه لازم دارد
      // (عکس آپلودشده وگرنه شیشه/مایعِ بطریِ رسم‌شده).
      gifts: products.map((p) => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn,
        image: p.image ?? null,
        glass: p.glass,
        liquid: p.liquid,
      })),
    });
  })
);

export default router;
