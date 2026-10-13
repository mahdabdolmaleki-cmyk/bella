import { Router } from "express";
import Product from "../models/Product.js";
import Settings from "../models/Settings.js";
import User from "../models/User.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { optionalUser } from "../middleware/authMiddleware.js";
import Order, { ORDER_STATUSES } from "../models/Order.js";
import { parseStarsConfig, starLevelFor, starPerks, starPerkSources } from "../utils/stars.js";
import { ah } from "../utils/asyncHandler.js";
import { int, bool, isPhone } from "../utils/validate.js";
import { parseCouponList, findCoupon, couponAmount } from "../utils/coupon.js";
import { findOwnedReferralCoupon, referralCouponError } from "../utils/referralCoupon.js";
import { hasPreviousFirstPurchaseOrder } from "../utils/firstPurchaseDiscount.js";
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
      const id = int(item?.id, { min: 1, max: 1e9, clamp: false });
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
    // Product.price is the active selling price (including any festival
    // price). The first-purchase/coupon/loyalty discount is calculated later,
    // so it cannot overwrite the product-level festival saving.
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
      const firstType = settings.firstPurchaseDiscountType === "amount" ? "amount" : "percent";
      const pct = Math.min(
        90,
        Math.max(0, Math.round(Number(settings.firstPurchasePercent) || 0))
      );
      const fixed = Math.min(subtotal, Math.max(0, Math.round(Number(settings.firstPurchaseAmount) || 0)));
      const amount = firstType === "amount" ? fixed : Math.min(subtotal, Math.round((subtotal * pct) / 100));
      if (amount > 0) {
        firstPurchaseDiscount = {
          percent: firstType === "percent" ? pct : 0,
          amount,
          fixed: firstType === "amount" ? amount : 0,
        };
        const phone = isPhone(req.body?.phone) || (req.user?.phone ?? "");
        const previous = await hasPreviousFirstPurchaseOrder(phone, req.user?._id).catch(() => true);
        if (previous) firstPurchaseDiscount = null;
      }
    }

    // پیش‌نمایش کد تخفیف — همان مالکیت، مصرف یک‌باره، انقضا و حداقل خریدِ
    // مسیر نهایی POST /api/orders؛ referral code با کوپن عمومی فرق دارد و
    // مستقل از روشن/خاموش‌بودن کوپن‌های عمومی بررسی می‌شود.
    const couponInput = String(req.body?.couponCode ?? "").trim().toUpperCase();
    let coupon = null;
    if (couponInput) {
      coupon = { input: couponInput, applied: null, error: "" };
      const couponsEnabled = settings.couponEnabled === "1";
      const found = couponsEnabled
        ? findCoupon(parseCouponList(settings.couponCodesJson), couponInput)
        : { reason: "notfound" };
      let resolvedCoupon = found.coupon || null;
      let referralUsedId = null;

      if (!resolvedCoupon && found.reason === "expired") {
        coupon.error = "تاریخ انقضای این کد تخفیف گذشته است.";
      }
      if (!resolvedCoupon && !coupon.error) {
        const referral = await findOwnedReferralCoupon(couponInput, req.user?._id);
        if (referral.coupon) {
          resolvedCoupon = referral.coupon;
          referralUsedId = referral.referralId;
        } else {
          coupon.error = referralCouponError(referral.reason);
          if (!coupon.error) {
            coupon.error = couponsEnabled
              ? "چنین کد تخفیفی وجود ندارد."
              : "کدهای تخفیف فعلاً غیرفعال هستند.";
          }
        }
      }

      if (resolvedCoupon && !coupon.error) {
        // کوپن عمومی فقط در صورت خریدِ پرداخت‌شده می‌سوزد و سفارشِ باز موقتاً
        // آن را قفل می‌کند؛ referral یک‌بارمصرف با flag اختصاصی‌اش کنترل می‌شود.
        if (!referralUsedId) {
          const usedOr = [];
          const couponPhone = isPhone(req.body?.phone) || (req.user?.phone ?? "");
          if (couponPhone) usedOr.push({ phone: couponPhone });
          if (req.user) usedOr.push({ user: req.user._id });
          if (usedOr.length) {
            const base = { couponCode: resolvedCoupon.code, $or: usedOr };
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
        if (!coupon.error && resolvedCoupon.minOrder && subtotal < resolvedCoupon.minOrder) {
          coupon.error = `این کد تخفیف فقط برای خریدهای بالای ${Number(resolvedCoupon.minOrder).toLocaleString("fa-IR")} تومان معتبر است.`;
        }
        if (!coupon.error) {
          coupon.applied = {
            code: resolvedCoupon.code,
            percent: resolvedCoupon.percent,
            amount: couponAmount(subtotal, resolvedCoupon),
            fixed: resolvedCoupon.amount > 0 ? resolvedCoupon.amount : 0,
            until: resolvedCoupon.until,
          };
        }
      }
    }

    // تخفیف ستاره (وفاداری) — برای لاگین‌شده‌ها، تا پیش‌نمایشِ سبد دقیقاً همان
    // قانونِ سرور («بزرگ‌تر برنده») را نشان دهد.
    let starDiscount = null;
    if (req.user) {
      const cfg = parseStarsConfig(settings.starsConfigJson);
      const me = await User.findById(req.user._id).select("points");
      const level = starLevelFor(me?.points ?? 0, cfg);
      const ben = starPerks(level, cfg);
      const byPercent = ben.discountPercent > 0 ? Math.min(subtotal, Math.round((subtotal * ben.discountPercent) / 100)) : 0;
      const byAmount = ben.discountAmount > 0 ? Math.min(subtotal, ben.discountAmount) : 0;
      const amount = Math.max(byPercent, byAmount);
      if (amount > 0) {
        const src = starPerkSources(level, cfg);
        const byAmountWins = byAmount >= byPercent;
        starDiscount = {
          percent: byAmountWins ? 0 : ben.discountPercent,
          amount,
          fixed: byAmountWins ? byAmount : 0,
          star: src.discount?.star ?? level,
          title: src.discount?.title || "",
        };
      }
    }

    // تخفیف‌ها روی هم جمع نمی‌شوند؛ بزرگ‌تر اعمال می‌شود.
    const candidates = [];
    if (firstPurchaseDiscount)
      candidates.push({ source: "first", percent: firstPurchaseDiscount.percent, amount: firstPurchaseDiscount.amount, fixed: firstPurchaseDiscount.fixed ?? 0, code: "" });
    if (coupon?.applied)
      candidates.push({ source: "coupon", percent: coupon.applied.percent, amount: coupon.applied.amount, fixed: coupon.applied.fixed, code: coupon.applied.code });
    if (starDiscount)
      candidates.push({ source: "star", percent: starDiscount.percent, amount: starDiscount.amount, fixed: starDiscount.fixed, code: "", star: starDiscount.star, title: starDiscount.title });
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
