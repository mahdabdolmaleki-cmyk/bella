import { Router } from "express";
import Product from "../models/Product.js";
import Settings from "../models/Settings.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { optionalUser } from "../middleware/authMiddleware.js";
import Order, { ORDER_STATUSES } from "../models/Order.js";
import { ah } from "../utils/asyncHandler.js";
import { int, bool, isPhone } from "../utils/validate.js";
import { parseCouponList, findCoupon, couponAmount } from "../utils/coupon.js";
import {
  PROVINCES,
  SHIPPING_METHODS,
  DEFAULT_FREE_SHIPPING_THRESHOLD,
  normaliseFreeShippingThreshold,
  quoteShipping,
  parseEtaDays,
  isMethodEnabled,
  isProvince,
} from "../utils/shipping.js";

const router = Router();
const MAX_LINES = 50;
const MAX_QTY = 99;

// Only checkout information is exposed publicly. Internal zone/origin metadata
// stays on the server and is used again when the order is priced and persisted.
function toPublicQuote(quote) {
  return {
    weightGrams: quote.weightGrams,
    billableKg: quote.billableKg,
    freeThreshold: quote.freeThreshold,
    freeRemaining: quote.freeRemaining,
    showEta: quote.showEta,
    options: quote.options.map((option) => ({
      key: option.key,
      label: option.label,
      icon: option.icon,
      desc: option.desc,
      codSupported: option.codSupported,
      cost: option.cost,
      listPrice: option.listPrice,
      free: option.free,
      insurance: option.insurance,
      codFee: option.codFee,
      weightGrams: option.weightGrams,
      billableKg: option.billableKg,
      showEta: option.showEta,
      etaDays: option.etaDays,
      etaText: option.etaText,
    })),
  };
}

// GET /api/shipping/options -> static catalogue for the checkout form
router.get(
  "/options",
  rateLimit({ name: "shipping-options", windowMs: 60 * 1000, max: 120 }),
  ah(async (_req, res) => {
    const settings = await Settings.getSingleton();
    const freeThreshold = normaliseFreeShippingThreshold(
      settings.shippingFreeThreshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD
    );
    const showEta = settings.deliveryEstimateEnabled !== "";
    res.set("Cache-Control", "no-store");
    res.json({
      provinces: PROVINCES,
      freeThreshold,
      showEta,
      // روش‌هایی که مدیر در پنل خاموش کرده به مشتری نشان داده نمی‌شوند.
      methods: SHIPPING_METHODS.filter((method) => isMethodEnabled(method, settings)).map((method) => {
        let customVal = null;
        if (method.key === "tipax") customVal = settings.deliveryDaysTipax;
        else if (method.key === "post-pishtaz") customVal = settings.deliveryDaysPishtaz;
        else if (method.key === "chapar") customVal = settings.deliveryDaysChapar;
        else if (method.key === "peyk") customVal = settings.deliveryDaysPeyk;
        const eta = parseEtaDays(customVal, method.days.far);
        return {
          key: method.key,
          label: method.label,
          icon: method.icon,
          desc: method.desc,
          codSupported: method.codSupported,
          showEta,
          etaDays: showEta ? { min: eta.min, max: eta.max } : { min: 0, max: 0 },
          etaText: showEta ? eta.text : "",
        };
      }),
    });
  })
);

// ---------------------------------------------------------------------------
// POST /api/shipping/quote  { province, items: [{ id, qty }], cod? }
//
// The cart only sends ids + quantities. Prices and weights are read from the
// database, exactly like POST /api/orders — so the quote the customer sees is
// produced by the same code that will later charge them.
// ---------------------------------------------------------------------------
router.post(
  "/quote",
  rateLimit({ name: "shipping-quote", windowMs: 60 * 1000, max: 60 }),
  optionalUser,
  ah(async (req, res) => {
    const province = isProvince(req.body?.province);
    if (!province) {
      return res.status(400).json({ error: "استان مقصد را انتخاب کنید." });
    }

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length === 0 || rawItems.length > MAX_LINES) {
      return res.status(400).json({ error: "اقلام سبد خرید معتبر نیستند." });
    }

    const wanted = new Map();
    for (const item of rawItems) {
      const id = int(item?.id, { min: 1, max: 1e9 });
      const qty = int(item?.qty, { min: 1, max: MAX_QTY, fallback: 1 }) || 1;
      if (id === null) continue;
      wanted.set(id, Math.min(MAX_QTY, (wanted.get(id) || 0) + qty));
    }
    if (wanted.size === 0) {
      return res.status(400).json({ error: "اقلام سبد خرید معتبر نیستند." });
    }

    const products = await Product.find({
      id: { $in: [...wanted.keys()] },
      active: true,
    }).select("id price sizeMl");

    if (products.length === 0) {
      return res.status(400).json({ error: "محصولات انتخابی در دسترس نیستند." });
    }

    const items = products.map((p) => ({
      id: p.id,
      qty: wanted.get(p.id),
      price: p.price,
      sizeMl: p.sizeMl,
    }));
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    const settings = await Settings.getSingleton();
    const quote = quoteShipping({
      province,
      items,
      subtotal,
      cod: bool(req.body?.cod),
      freeShippingThreshold:
        settings.shippingFreeThreshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD,
      settings,
    });

    // تخفیف خرید اول — تا سبد خرید قبل از ثبت سفارش هم بتواند نشانش دهد.
    // مرجع نهایی همان POST /api/orders است؛ این فقط برای نمایش است.
    // v40: «اول بودن» با شمارهٔ فرم چک می‌شود تا میهمان هم تخفیف ببیند.
    // تا وقتی شماره‌ای وارد نشده، خوش‌بینانه نشان داده می‌شود و با تایپِ شمارهٔ
    // مشتریِ قبلی خودبه‌خود حذف می‌شود (quote دوباره گرفته می‌شود).
    let firstPurchaseDiscount = null;
    if (settings.firstPurchaseDiscountEnabled === "1") {
      const pct = Math.min(
        90,
        Math.max(0, Math.round(Number(settings.firstPurchasePercent) || 0))
      );
      if (pct > 0) {
        firstPurchaseDiscount = {
          percent: pct,
          amount: Math.min(subtotal, Math.round((subtotal * pct) / 100)),
        };
        const phone = isPhone(req.body?.phone) || (req.user?.phone ?? "");
        if (phone) {
          const ident = { $or: [{ phone }] };
          if (req.user) ident.$or.push({ user: req.user._id });
          const previous = await Order.exists(ident).catch(() => null);
          if (previous) firstPurchaseDiscount = null;
        }
      }
    }

    // پیش‌نمایش کد تخفیف — اعتبارسنجی نهایی در POST /api/orders است.
    const couponInput = String(req.body?.couponCode ?? "").trim().toUpperCase();
    let coupon = null;
    if (couponInput) {
      coupon = { input: couponInput, applied: null, error: "" };
      if (settings.couponEnabled !== "1") {
        coupon.error = "کدهای تخفیف فعلاً غیرفعال هستند.";
      } else {
        const found = findCoupon(parseCouponList(settings.couponCodesJson), couponInput);
        if (found.reason === "notfound") coupon.error = "چنین کد تخفیفی وجود ندارد.";
        else if (found.reason === "expired") coupon.error = "تاریخ انقضای این کد گذشته است.";
        else {
          // v45: پیش‌نمایش سبد هم دقیقاً قانون سرور را می‌گوید: سوخته = خریدِ
          // پرداخت‌شده؛ قفلِ موقت = سفارشِ بازِ پرداخت‌نشده با همان کد.
          const usedOr = [];
          const couponPhone = isPhone(req.body?.phone) || (req.user?.phone ?? "");
          if (couponPhone) usedOr.push({ phone: couponPhone });
          if (req.user) usedOr.push({ user: req.user._id });
          if (usedOr.length) {
            const base = { couponCode: found.coupon.code, $or: usedOr };
            const CANCELLED = ORDER_STATUSES[ORDER_STATUSES.length - 1];
            const burned = await Order.exists({
              ...base,
              paymentStatus: "paid",
              status: { $ne: CANCELLED },
            }).catch(() => null);
            if (burned) coupon.error = "این کد را قبلاً با یک خرید مصرف کرده‌اید.";
            else {
              const held = await Order.exists({
                ...base,
                paymentStatus: { $in: ["unpaid", "pending"] },
                status: { $ne: CANCELLED },
              }).catch(() => null);
              if (held) coupon.error = "این کد روی سفارشِ پرداخت‌نشدهٔ دیگری از شما قفل است؛ پس از انقضا یا لغو آن آزاد می‌شود.";
            }
          }
        }
        if (!coupon.error && found.reason === undefined)
          coupon.applied = {
            code: found.coupon.code,
            percent: found.coupon.percent,
            amount: couponAmount(subtotal, found.coupon),
            fixed: found.coupon.amount > 0 ? found.coupon.amount : 0,
            until: found.coupon.until,
          };
      }
    }

    // تخفیف‌ها روی هم جمع نمی‌شوند؛ بزرگ‌تر اعمال می‌شود.
    const candidates = [];
    if (firstPurchaseDiscount)
      candidates.push({ source: "first", percent: firstPurchaseDiscount.percent, amount: firstPurchaseDiscount.amount, fixed: 0, code: "" });
    if (coupon?.applied)
      candidates.push({ source: "coupon", percent: coupon.applied.percent, amount: coupon.applied.amount, fixed: coupon.applied.fixed, code: coupon.applied.code });
    const discount = candidates.length ? candidates.sort((a, b) => b.amount - a.amount)[0] : null;

    res.json({
      province,
      subtotal,
      discount,
      coupon,
      firstPurchaseDiscount,
      ...toPublicQuote(quote),
    });
  })
);

export default router;
