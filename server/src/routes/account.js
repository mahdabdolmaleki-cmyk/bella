import { Router } from "express";
import Order from "../models/Order.js";
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
 * IMPORTANT DESIGN DECISION — points are DERIVED, never stored as a mutable
 * balance. They are recomputed from the customer's settled orders on every
 * request. That means:
 *   - changing the conversion rate in the admin panel instantly and correctly
 *     re-values every customer, with no migration job;
 *   - a refunded or cancelled order cannot leave phantom points behind;
 *   - there is no balance field an attacker could try to inflate.
 */
const router = Router();

const FAVOURITE_LIMIT = 100;

/** Only settled money counts towards the club. */
const SETTLED_MATCH = {
  status: { $ne: "لغو شد" },
  excludeFromSales: { $ne: true },
  $or: [{ paymentStatus: "paid" }, { status: "تحویل داده شد" }],
};

export const TIERS = [
  { key: "regular", label: "عادی", icon: "✦", color: "#93ac9c" },
  { key: "gold", label: "طلایی", icon: "★", color: "#d4af37" },
  { key: "diamond", label: "الماسی", icon: "◆", color: "#8fd3ff" },
];

function tierFor(totalSpent, goldAt, diamondAt) {
  if (diamondAt > 0 && totalSpent >= diamondAt) return "diamond";
  if (goldAt > 0 && totalSpent >= goldAt) return "gold";
  return "regular";
}

router.use(requireUser);
router.use(rateLimit({ name: "account-api", windowMs: 60 * 1000, max: 120 }));

// ---------------------------------------------------------------------------
// Loyalty club
// ---------------------------------------------------------------------------
router.get(
  "/loyalty",
  ah(async (req, res) => {
    const settings = await Settings.getSingleton();
    const perPoint = Math.max(1, Number(settings.tomanPerPoint) || 10000);
    const goldAt = Math.max(0, Number(settings.tierGoldSpend) || 0);
    const diamondAt = Math.max(0, Number(settings.tierDiamondSpend) || 0);

    const rows = await Order.aggregate([
      { $match: { user: req.user._id, ...SETTLED_MATCH } },
      { $group: { _id: null, totalSpent: { $sum: "$total" }, orders: { $sum: 1 } } },
    ]);
    const totalSpent = rows[0]?.totalSpent || 0;
    const orders = rows[0]?.orders || 0;
    const points = Math.floor(totalSpent / perPoint);
    const tier = tierFor(totalSpent, goldAt, diamondAt);

    const nextThreshold =
      tier === "regular" && goldAt > 0
        ? { tier: "gold", at: goldAt }
        : tier === "gold" && diamondAt > 0
          ? { tier: "diamond", at: diamondAt }
          : null;

    res.json({
      points,
      tier,
      tiers: TIERS,
      totalSpent,
      orders,
      tomanPerPoint: perPoint,
      thresholds: { gold: goldAt, diamond: diamondAt },
      next: nextThreshold
        ? {
            ...nextThreshold,
            remaining: Math.max(0, nextThreshold.at - totalSpent),
            progress:
              nextThreshold.at > 0
                ? Math.min(100, Math.round((totalSpent / nextThreshold.at) * 100))
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
    const productId = int(req.body?.productId, { min: 1, max: 1e9 });
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
    const productId = int(req.params.productId, { min: 1, max: 1e9 });
    if (productId === null) return res.status(400).json({ error: "شناسه نامعتبر است." });
    await req.user.updateOne({ $pull: { favorites: productId } });
    res.json({ ok: true, favorite: false });
  })
);

export default router;
