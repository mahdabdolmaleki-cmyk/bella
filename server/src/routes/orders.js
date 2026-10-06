import { Router } from "express";
import crypto from "crypto";
import Order, { ORDER_STATUSES } from "../models/Order.js";
import Product from "../models/Product.js";
import Settings from "../models/Settings.js";
import { requireUser } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, int, bool, isPhone, isEmail, isPostalCode, addressIssue } from "../utils/validate.js";
import { isZarinpalConfigured } from "../utils/zarinpal.js";
import { parseCouponList, findCoupon, couponAmount } from "../utils/coupon.js";
import { notifyOrderPlaced } from "../utils/orderNotify.js";
import AbandonedCart from "../models/AbandonedCart.js";
import {
  resolveShipping,
  isProvince,
  DEFAULT_SHIPPING_METHOD,
  DEFAULT_FREE_SHIPPING_THRESHOLD,
} from "../utils/shipping.js";

const router = Router();
const MAX_LINES = 50;
const MAX_QTY = 99;

function makeCode() {
  // crypto.randomInt instead of Math.random — order codes are guessable
  // identifiers otherwise.
  // 6 digits were brute-forceable (only 900k codes) and the payment routes
  // accept a bare code, so widen it to 12 hex chars (~2.8e14 combinations).
  return `BL-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

router.post(
  "/",
  rateLimit({
    name: "create-order",
    windowMs: 10 * 60 * 1000,
    max: 10, // 10 orders / 10 minutes / IP
    message: "تعداد سفارش‌های ثبت‌شده بیش از حد مجاز است. کمی بعد تلاش کنید.",
  }),
  requireUser,
  ah(async (req, res) => {
    // v33: حالت تعمیر. مدیر از پنل می‌تواند فروش را موقتاً ببندد. این بررسی
    // عمداً سمت سرور است؛ پنهان‌کردن دکمه در رابط کاربری به تنهایی قابل دور زدن است.
    const siteSettings = await Settings.getSingleton();
    if (siteSettings?.paymentsDisabled === "1") {
      return res.status(503).json({
        error:
          (siteSettings.paymentsDisabledNote || "").trim() ||
          "ثبت سفارش موقتاً غیرفعال است. کمی بعد تلاش کنید.",
        maintenance: true,
      });
    }

    const name = str(req.body?.customerName ?? req.body?.name, { max: 80 });
    const phone = str(req.body?.phone, { max: 20 });
    const address = str(req.body?.address, { max: 500 });
    const note = str(req.body?.note, { max: 500 });
    const city = str(req.body?.city, { max: 60 });
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

    // The e-mail is where the invoice / shipping notice goes. Logged-in buyers
    // fall back to their account address so they never retype it.
    const email = isEmail(req.body?.email) || (req.user?.email ?? "");
    const postalCode = isPostalCode(req.body?.postalCode);
    const province = isProvince(req.body?.province);
    const shippingMethodKey = str(req.body?.shippingMethod, { max: 30 }) || DEFAULT_SHIPPING_METHOD;
    // پس‌کرایه: کرایه درِ منزل پرداخت می‌شود؛ آنلاین فقط قیمت کالاها.
    const cod = bool(req.body?.shippingCod);
    // باکس ویژه VIP — هزینه همیشه از تنظیمات خوانده می‌شود، نه از مشتری.
    const wantsVip = bool(req.body?.vipBox);
    const vipBox =
      wantsVip && siteSettings.vipBoxEnabled === "1"
        ? true
        : false;
    const vipBoxFee = vipBox
      ? Math.max(0, Math.min(10_000_000, Math.round(Number(siteSettings.vipBoxFee) || 0)))
      : 0;

    const termsAccepted = bool(req.body?.termsAccepted);
    if (!termsAccepted) {
      return res.status(400).json({
        error: "برای ثبت سفارش و پرداخت، تأیید قوانین و مقررات سایت الزامی است.",
      });
    }

    if (!name) return res.status(400).json({ error: "نام گیرنده الزامی است." });
    if (!isPhone(phone)) return res.status(400).json({ error: "شماره تماس معتبر وارد کنید." });
    if (!email) return res.status(400).json({ error: "ایمیل معتبر وارد کنید." });
    if (!province) return res.status(400).json({ error: "استان مقصد را انتخاب کنید." });
    if (city.length < 2) return res.status(400).json({ error: "نام شهر را وارد کنید." });
    if (!postalCode) {
      return res.status(400).json({ error: "کد پستی ۱۰ رقمی معتبر وارد کنید." });
    }
    // Same rule as the profile endpoint, so an address that saves can always
    // be used to check out and vice versa.
    const addrIssue = addressIssue(address);
    if (addrIssue) return res.status(400).json({ error: addrIssue });
    if (rawItems.length === 0) return res.status(400).json({ error: "سبد خرید خالی است." });
    if (rawItems.length > MAX_LINES) {
      return res.status(400).json({ error: "تعداد اقلام سبد بیش از حد مجاز است." });
    }

    // Merge duplicate ids and clamp quantities.
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

    // PRICES ARE ALWAYS TAKEN FROM THE DATABASE, never from the client body —
    // otherwise a user could post price: 1 and buy anything for 1 toman.
    const products = await Product.find({ id: { $in: [...wanted.keys()] }, active: true });
    if (products.length === 0) {
      return res.status(400).json({ error: "محصولات انتخابی در دسترس نیستند." });
    }

    const items = products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      qty: wanted.get(p.id),
      image: p.image,
      // Carried only for the weight calculation; not persisted on the order.
      sizeMl: p.sizeMl,
    }));

    if (items.length !== wanted.size) {
      return res
        .status(400)
        .json({ error: "برخی از محصولات سبد دیگر موجود نیستند. سبد خرید را به‌روز کنید." });
    }

    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    // ---- تخفیف خرید اول + کد تخفیف (v40) ----
    // باگ v35 رفع شد: تخفیف خرید اول فقط به کاربر لاگین‌شده می‌رسید؛ حالا
    // «اول بودن» با خودِ شمارهٔ سفارش سنجیده می‌شود (و در صورت لاگین، شناسهٔ
    // حساب هم). مرجع نهایی همین‌جاست — سبد خرید فقط پیش‌نمایش می‌کند.
    // کد تخفیف و تخفیف خرید اول روی هم جمع نمی‌شوند؛ هرکدام که بیشتر باشد.
    let discountPercent = 0;
    let discountAmount = 0;
    let couponCodeUsed = "";
    let couponFixedValue = 0; // v41 — کدِ مبلغی (تومان)
    if (siteSettings.firstPurchaseDiscountEnabled === "1") {
      const pct = Math.min(90, Math.max(0, Math.round(Number(siteSettings.firstPurchasePercent) || 0)));
      if (pct > 0) {
        const ident = { $or: [{ phone }] };
        if (req.user) ident.$or.push({ user: req.user._id });
        const previous = await Order.exists(ident).catch(() => null);
        if (!previous) {
          discountPercent = pct;
          discountAmount = Math.min(subtotal, Math.round((subtotal * pct) / 100));
        }
      }
    }
    const rawCoupon = str(req.body?.couponCode, { max: 24 });
    if (rawCoupon) {
      if (siteSettings.couponEnabled !== "1") {
        return res.status(400).json({ error: "کدهای تخفیف فعلاً غیرفعال هستند." });
      }
      const found = findCoupon(parseCouponList(siteSettings.couponCodesJson), rawCoupon);
      if (found.reason === "notfound") {
        return res.status(400).json({ error: "چنین کد تخفیفی وجود ندارد." });
      }
      if (found.reason === "expired") {
        return res.status(400).json({ error: "تاریخ انقضای این کد تخفیف گذشته است." });
      }
      // v45 (قانون نهایی): کد تخفیف فقط با «خرید واقعی» می‌سوزد — نه با ثبت سفارش:
      //  • سوخته: این اکانت سفارشِ پرداخت‌شده‌ای (paid) با همین کد دارد که بعداً
      //    لغو نشده باشد. سفارشِ پرداختی که لغو شود، کد را آزاد می‌کند.
      //  • قفلِ موقت: یک سفارشِ بازِ پرداخت‌نشده (unpaid/pending) با همین کد وجود
      //    دارد → نمی‌شود هم‌زمان سفارش دوم با همان کد زد. با انقضای sweeper یا
      //    لغو شدن، خودبه‌خود آزاد می‌شود.
      //  • پرداختِ سفارشِ منقضی‌شده در payment.js رد می‌شود (paymentStatus=failed
      //    دیگر قابل پرداخت نیست)، پس حفره‌ای برای دو‌برداشتنِ تخفیف وجود ندارد.
      const usedOr = [{ phone }];
      if (req.user) usedOr.push({ user: req.user._id });
      const CANCELLED = ORDER_STATUSES[ORDER_STATUSES.length - 1];
      const usedBase = { couponCode: found.coupon.code, $or: usedOr };
      if (await Order.exists({ ...usedBase, paymentStatus: "paid", status: { $ne: CANCELLED } })) {
        return res.status(400).json({
          error: "شما پیش‌تر با این کد خریدی انجام داده‌اید؛ هر کد برای هر اکانت فقط یک‌بار قابل استفاده است.",
        });
      }
      if (await Order.exists({ ...usedBase, paymentStatus: { $in: ["unpaid", "pending"] }, status: { $ne: CANCELLED } })) {
        return res.status(400).json({
          error: "این کد فعلاً روی سفارشِ پرداخت‌نشدهٔ دیگری از شما باز است؛ اگر پرداختش نکنید، پس از انقضا دوباره آزاد می‌شود.",
        });
      }
      const amount = couponAmount(subtotal, found.coupon);
      if (amount > discountAmount) {
        discountPercent = found.coupon.amount > 0 ? 0 : found.coupon.percent;
        couponFixedValue = found.coupon.amount > 0 ? found.coupon.amount : 0;
        discountAmount = amount;
        couponCodeUsed = found.coupon.code;
      }
    }
    const payable = subtotal - discountAmount;

    // SHIPPING: never trust a cost sent by the browser. The courier the buyer
    // picked is re-priced here from the destination province and the real cart
    // weight, so the gateway always charges the amount we computed.
    const { chosen: shipping } = resolveShipping({
      province,
      methodKey: shippingMethodKey,
      items,
      subtotal,
      cod,
      freeShippingThreshold:
        siteSettings.shippingFreeThreshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD,
      settings: siteSettings,
    });
    if (!shipping) {
      return res.status(400).json({ error: "روش ارسالی برای این مقصد در دسترس نیست." });
    }
    // اگر مشتری روشی را فرستاده که مدیر غیرفعال کرده (یا برای این مقصد نیست)،
    // بی‌صدا روش دیگری با قیمت دیگر جایگزین نمی‌شود؛ باید دوباره انتخاب کند.
    if (req.body?.shippingMethod && shipping.key !== shippingMethodKey) {
      return res.status(400).json({
        error: "روش ارسال انتخابی در حال حاضر فعال نیست. لطفاً روش ارسال دیگری انتخاب کنید.",
      });
    }
    if (cod && !shipping.codSupported) {
      return res.status(400).json({
        error: `«${shipping.label}» گزینهٔ پس‌کرایه ندارد. لطفاً روش ارسال دیگری انتخاب کنید.`,
      });
    }

    const showEta = siteSettings.deliveryEstimateEnabled !== "";
    const shippingEtaDays = showEta ? (shipping.etaDays?.max || 0) : 0;
    const total = payable + shipping.cost + vipBoxFee;

    // Only the persisted fields go into the order document.
    const orderItems = items.map(({ sizeMl: _sizeMl, ...rest }) => rest);

    // ---- Atomic stock reservation -----------------------------------------
    // "read then write" would let two buyers take the same last unit. The
    // conditional $inc below can only succeed while enough stock is left.
    const reserved = [];
    for (const item of items) {
      const updated = await Product.findOneAndUpdate(
        {
          id: item.id,
          active: true,
          $or: [{ allowBackorder: true }, { stock: { $gte: item.qty } }],
        },
        { $inc: { stock: -item.qty } },
        { new: true }
      );
      if (!updated) {
        // Roll back whatever was already reserved in this request.
        await Promise.all(
          reserved.map((r) =>
            Product.updateOne({ id: r.id }, { $inc: { stock: r.qty } }).catch(() => { })
          )
        );
        return res.status(409).json({
          error: `موجودی «${item.name}» کافی نیست. سبد خرید را به‌روز کنید.`,
        });
      }
      // Negative stock can only happen for back-ordered items; clamp it.
      if (updated.stock < 0) {
        await Product.updateOne({ id: item.id }, { $set: { stock: 0 } }).catch(() => { });
      }
      reserved.push(item);
    }

    const releaseReserved = () =>
      Promise.all(
        reserved.map((r) =>
          Product.updateOne({ id: r.id }, { $inc: { stock: r.qty } }).catch(() => { })
        )
      );

    // Retry on the (very unlikely) duplicate order code.
    let order = null;
    for (let attempt = 0; attempt < 5 && !order; attempt += 1) {
      try {
        order = await Order.create({
          code: makeCode(),
          customerName: name,
          phone,
          email,
          province,
          city,
          postalCode,
          address,
          note,
          items: orderItems,
          subtotal,
          discountPercent,
          discountAmount,
          couponCode: couponCodeUsed,
          couponFixed: couponFixedValue,
          shippingCod: cod,
          vipBox,
          vipBoxFee,
          shippingCost: shipping.cost,
          shippingMethod: shipping.key,
          shippingLabel: shipping.label,
          shippingZone: shipping.zone,
          shippingWeightGrams: shipping.weightGrams,
          shippingEtaDays,
          freeShipping: shipping.free,
          total,
          user: req.user?._id || null,
          stockCommitted: true,
          paymentStatus: "unpaid",
        });
      } catch (err) {
        // Duplicate order code is safe to retry with a new code.
        if (err?.code === 11000) {
          continue;
        }

        // Order creation failed after stock was reserved.
        // Release every reservation before propagating the error.
        await releaseReserved();

        throw err;
      }
    }
    if (!order) {
      // Never keep stock reserved for an order that was not created.
      await releaseReserved();
      return res.status(503).json({ error: "ثبت سفارش ناموفق بود. دوباره تلاش کنید." });
    }

    // سبد رها شده → تبدیل شد (v36)
    if (req.user?._id) {
      await AbandonedCart.findOneAndUpdate(
        { user: req.user._id, converted: false },
        { $set: { converted: true, convertedAt: new Date() } }
      ).catch(() => {});
    }

    logActivity(req, {
      action: "order.create",
      target: order.code,
      status: 201,
      meta: `total=${total} shipping=${shipping.key}:${shipping.cost}${cod ? " cod" : ""}${discountPercent ? ` first=${discountPercent}%` : ""}${vipBox ? " vip" : ""}`,
    });

    // پیامک/ایمیل «سفارش ثبت شد» + خبر مدیر:
    // با درگاه فعال، بعد از تأیید پرداخت در routes/payment.js ارسال می‌شود؛
    // بدون درگاه (سفارش تلفنی/دستی) مثل قبل همین‌جا.
    const onlinePayment = isZarinpalConfigured();
    if (!onlinePayment) notifyOrderPlaced(order);

    res.status(201).json({
      order: order.toDTO(),
      shipping,
      // مبلغ واقعی درگاه — با پس‌کرایه، کرایه از پرداخت آنلاین کم می‌شود.
      payableAmount: order.onlinePayable(),
      // Tells the frontend whether it should redirect to the gateway.
      payment: { online: onlinePayment },
    });
  })
);

export default router;
