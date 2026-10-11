import { Router } from "express";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { parseStarsConfig, starLevelFor, starPerks } from "../utils/stars.js";
import { ensureReferralCode } from "../utils/referral.js";
import Message from "../models/Message.js";
import Product from "../models/Product.js";
import Settings from "../models/Settings.js";
import { requireUser } from "../middleware/authMiddleware.js";
import { notifySms } from "../utils/sms.js";
import { notifyEmail } from "../utils/emailNotify.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { int, str } from "../utils/validate.js";

/**
 * Customer-account extras: the loyalty club (points + membership tier) and the
 * favourites list.
 *
 * DESIGN — امتیاز وفاداری در فیلد User.points «ذخیره» می‌شود (نه بازمحاسبه در
 * هر درخواست). این مقدار از این مسیرها به‌صورت یک‌بارمصرف تغییر می‌کند:
 *   1) ثبت سفارش (وضعیت «در انتظار تأیید») — awardOrderPoints در models/Order.js
 *      امتیاز را می‌دهد؛ اگر همان سفارش «لغو شد» شود، revokeOrderPoints دقیقاً
 *      همان مقدار را کم می‌کند (هر دو اتمیک و idempotent)؛
 *   2) زیرمجموعه‌گیری — utils/referral.js؛
 *   3) ویرایش دستی مدیر در پنل.
 */
const router = Router();

const FAVOURITE_LIMIT = 100;

/** Only settled money counts towards the club. */
const SETTLED_MATCH = {
  status: { $ne: "لغو شد" },
  excludeFromSales: { $ne: true },
  $or: [{ paymentStatus: "paid" }, { status: "تحویل داده شد" }],
};

// (کد مردهٔ TIERS/tierFor حذف شد — سیستم وفاداری ستاره‌ای جایگزین شده است.)

router.use(requireUser);
router.use(rateLimit({ name: "account-api", windowMs: 60 * 1000, max: 120 }));

// ---------------------------------------------------------------------------
// Loyalty club
// ---------------------------------------------------------------------------
router.get(
  "/loyalty",
  ah(async (req, res) => {
    // وفاداری ستاره‌ای (v42): امتیاز ذخیره‌شدهٔ کاربر + آستانه‌های قابل‌تنظیم.
    const settings = await Settings.getSingleton();
    const cfg = parseStarsConfig(settings.starsConfigJson);
    const me = await User.findById(req.user._id).select("points vip referralCode referredBy");
    // هر مشتری باید کد معرف داشته باشد تا بخش زیرمجموعه‌گیری همیشه نشان داده شود.
    const referralCode = me ? await ensureReferralCode(me) : "";
    const points = me?.points ?? 0;
    const star = starLevelFor(points, cfg);

    const rows = await Order.aggregate([
      { $match: { user: req.user._id, ...SETTLED_MATCH } },
      { $group: { _id: null, totalSpent: { $sum: "$total" }, orders: { $sum: 1 } } },
    ]);
    const totalSpent = rows[0]?.totalSpent || 0;
    const orders = rows[0]?.orders || 0;

    // تعداد زیرمجموعه‌هایی که با کدِ این مشتری ثبت‌نام کرده‌اند.
    const referralCount = me ? await User.countDocuments({ referredBy: me._id }) : 0;

    // مزایا به‌صورت آرایهٔ کلید (برای نمایش) + جزئیات تخفیف (درصدی/مبلغی).
    const ben = starPerks(star, cfg);
    const perks = ["vipbox", "freeship", "gift"].filter((k) => ben[k]);
    if (ben.discountPercent > 0 || ben.discountAmount > 0) perks.push("discount");

    const nextStar = star < cfg.length ? cfg[star] : null;
    res.json({
      points,
      star,
      stars: cfg,
      perks,
      discountPercent: ben.discountPercent,
      discountAmount: ben.discountAmount,
      vip: me?.vip === true,
      referralCode,
      referralCount,
      totalSpent,
      orders,
      next: nextStar
        ? {
            title: nextStar.title,
            at: Number(nextStar.points) || 0,
            remaining: Math.max(0, (Number(nextStar.points) || 0) - points),
            progress:
              (Number(nextStar.points) || 0) > 0
                ? Math.min(100, Math.round((points / (Number(nextStar.points) || 1)) * 100))
                : 0,
          }
        : null,
    });
  })
);

// ---------------------------------------------------------------------------
// Favourites
// ---------------------------------------------------------------------------
router.get(
  "/favorites",
  ah(async (req, res) => {
    const ids = (req.user.favorites || []).slice(0, FAVOURITE_LIMIT);
    if (ids.length === 0) return res.json({ favorites: [], products: [] });
    const products = await Product.find({ id: { $in: ids }, active: true }).sort({ id: 1 });
    res.json({ favorites: ids, products: products.map((p) => p.toDTO()) });
  })
);

router.post(
  "/favorites",
  ah(async (req, res) => {
    const productId = int(req.body?.productId, { min: 1, max: 1e9, clamp: false });
    if (productId === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const exists = await Product.exists({ id: productId, active: true });
    if (!exists) return res.status(404).json({ error: "محصول یافت نشد." });

    if ((req.user.favorites || []).length >= FAVOURITE_LIMIT) {
      return res
        .status(400)
        .json({ error: `فهرست علاقه‌مندی‌ها حداکر ${FAVOURITE_LIMIT} محصول را می‌پذیرد.` });
    }

    // $addToSet is atomic — double-clicking the heart cannot create duplicates.
    await req.user.updateOne({ $addToSet: { favorites: productId } });
    res.json({ ok: true, favorite: true });
  })
);

// ---------------------------------------------------------------------------
// درخواست لغو سفارش (v36 → v37: اطلاع‌رسانی کامل برای ادمین با کد پیگیری، اسم، تلفن، مبلغ)
// مشتری از پنل خودش درخواست می‌دهد: پرچم روی سفارش می‌نشیند، یک پیام در تب
// «پیام‌ها»ی پنل ادمین ثبت می‌شود و شمارهٔ تماس مدیر برای پیگیری برمی‌گردد.
// ---------------------------------------------------------------------------
const CANCELLED_STATUS = "لغو شد";
const SHIPPED_STATUSES = ["ارسال شد", "تحویل داده شد", "لغو شد"];
function isCancelRequestable(status) {
  return !SHIPPED_STATUSES.includes(status);
}

router.post(
  "/orders/:code/cancel-request",
  rateLimit({ name: "cancel-request", windowMs: 60 * 1000, max: 10 }),
  ah(async (req, res) => {
    const code = str(req.params.code, { max: 32 });
    if (!code) return res.status(400).json({ error: "شناسه سفارش نامعتبر است." });

    const order = await Order.findOne({ code, user: req.user._id });
    if (!order) return res.status(404).json({ error: "سفارش پیدا نشد." });

    const settings = await Settings.getSingleton();
    const adminPhone = settings.contactPhone || "";
    const adminEmail = settings.contactEmail || "";

    if (order.cancelRequested) {
      return res.json({ ok: true, already: true, adminPhone, adminEmail });
    }
    if (!isCancelRequestable(order.status)) {
      return res.status(409).json({
        error: "در این مرحله از سفارش، لغو فقط از طریق پشتیبانی ممکن است.",
        adminPhone,
        adminEmail,
      });
    }
    if (order.status === CANCELLED_STATUS) {
      return res.status(409).json({
        error: "این سفارش قبلاً لغو شده است.",
        adminPhone,
        adminEmail,
      });
    }

    order.cancelRequested = true;
    order.cancelRequestedAt = new Date();
    await order.save();

    // v37: اطلاع‌رسانی کامل برای ادمین — کد پیگیری، اسم، تلفن، مبلغ سفارش
    const totalFa = Number(order.total || 0).toLocaleString("fa-IR");
    const totalEn = Number(order.total || 0).toLocaleString("en-US");
    const nowFa = new Date().toLocaleString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const detailBody = [
      "🚨 درخواست لغو سفارش",
      `کد پیگیری: ${order.code}`,
      `نام مشتری: ${order.customerName || "—"}`,
      `شماره تماس: ${order.phone || "—"}`,
      `مبلغ سفارش: ${totalFa} تومان`,
      `وضعیت فعلی: ${order.status}`,
      `زمان درخواست: ${nowFa}`,
    ].join("\n");

    // درخواست در تب «پیام‌ها»ی پنل ادمین ظاهر می‌شود — با جزئیات کامل
    await Message.create({
      name: order.customerName || "مشتری بلا",
      phone: order.phone,
      body: detailBody,
    }).catch(() => {});

    // اطلاع‌رسانی لغو به مدیر — SMS با قالب + ایمیل همزمان (fire-and-forget)
    // کد پیگیری، نام، تلفن، مبلغ — از تنظیمات smsCancelAdminEnabled / emailCancelAdminEnabled
    notifySms("cancelAdmin", null, {
      orderId: order.code,
      name: order.customerName || "مشتری",
      total: totalEn,
      phone: order.phone || "",
    }).catch(() => {});

    notifyEmail("cancelAdmin", null, {
      orderId: order.code,
      name: order.customerName || "مشتری",
      total: totalFa,
      phone: order.phone || "",
      status: order.status,
      time: nowFa,
    }).catch(() => {});

    res.json({ ok: true, adminPhone, adminEmail });
  })
);

router.delete(
  "/favorites/:productId",
  ah(async (req, res) => {
    const productId = int(req.params.productId, { min: 1, max: 1e9, clamp: false });
    if (productId === null) return res.status(400).json({ error: "شناسه نامعتبر است." });
    await req.user.updateOne({ $pull: { favorites: productId } });
    res.json({ ok: true, favorite: false });
  })
);

export default router;
