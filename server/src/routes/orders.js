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
import { giftPoolProducts, giftInStock, defaultGiftProduct } from "../utils/gifts.js";
import { isZarinpalConfigured } from "../utils/zarinpal.js";
import { parseCouponList, findCoupon, couponAmount } from "../utils/coupon.js";
import ReferralCode from "../models/ReferralCode.js";
import { findOwnedReferralCoupon, referralCouponError } from "../utils/referralCoupon.js";
import { hasPreviousFirstPurchaseOrder } from "../utils/firstPurchaseDiscount.js";
import { parseStarsConfig, starLevelFor, starPerks, starPerkSources } from "../utils/stars.js";
import User from "../models/User.js";
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
    // وفاداری ستاره‌ای (v42): مزایای ستارهٔ مشتری به‌صورت خودکار در خرید لحاظ می‌شود.
    const starsCfg = parseStarsConfig(siteSettings.starsConfigJson);
    const starLevel = req.user ? starLevelFor(req.user.points ?? 0, starsCfg) : 0;
    const starBen = starPerks(starLevel, starsCfg);
    if (req.user?.vip) starBen.vipbox = true; // VIP فقط توسط ادمین؛ باکس رایگان
    // باکس ویژه VIP — هزینه همیشه از تنظیمات خوانده می‌شود، نه از مشتری.
    // اگر مشتری مزیتِ «باکس VIP رایگان» داشته باشد، حتی بدون انتخابِ دستی هم
    // به‌صورت خودکار و رایگان روی سفارش اعمال می‌شود (ویژگیِ ستاره).
    const wantsVip = bool(req.body?.vipBox);
    const vipBox = siteSettings.vipBoxEnabled === "1" && (wantsVip || starBen.vipbox);
    const vipBoxFee = vipBox
      ? starBen.vipbox
        ? 0
        : Math.max(0, Math.min(10_000_000, Math.round(Number(siteSettings.vipBoxFee) || 0)))
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
      const id = int(item?.id, { min: 1, max: 1e9, clamp: false });
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
      // Snapshot of campaign state for the invoice (جشنواره/تخفیف + مبلغ تخفیف قلم).
      oldPrice: p.oldPrice ?? null,
      festival: p.festival === true,
      discount: p.discount === true,
      points: p.points ?? 1,
      // Carried only for the weight calculation; not persisted on the order.
      sizeMl: p.sizeMl,
    }));

    if (items.length !== wanted.size) {
      return res
        .status(400)
        .json({ error: "برخی از محصولات سبد دیگر موجود نیستند. سبد خرید را به‌روز کنید." });
    }

    // `Product.price` is the current selling price, including any festival
    // price already applied to the product. Order-level discounts are calculated
    // after this subtotal, so first-purchase discounts do not replace festival savings.
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    // ---- تخفیف خرید اول + کد تخفیف (v40) ----
    // باگ v35 رفع شد: تخفیف خرید اول فقط به کاربر لاگین‌شده می‌رسید؛ حالا
    // «اول بودن» با خودِ شمارهٔ سفارش سنجیده می‌شود (و در صورت لاگین، شناسهٔ
    // حساب هم). مرجع نهایی همین‌جاست — سبد خرید فقط پیش‌نمایش می‌کند.
    // کد تخفیف و تخفیف خرید اول/وفاداری روی جمع سبد رقابت می‌کنند؛ جشنواره
    // تخفیفِ محصول است و قبلاً در Product.price لحاظ شده، پس مستقل باقی می‌ماند.
    let discountPercent = 0;
    let discountAmount = 0;
    let discountSource = "none"; // none | first | coupon | star — برای نمایشِ دقیق در فاکتور
    let couponCodeUsed = "";
    let discountFixedValue = 0; // مبلغِ ثابتِ تخفیف برنده (برای فاکتور)
    let referralUsedId = null; // v43 — کد رفرال یک‌بارمصرفی که باید پس از ثبت سفارش بسوزد
    let referralUsedCode = "";
    if (siteSettings.firstPurchaseDiscountEnabled === "1") {
      const firstType = siteSettings.firstPurchaseDiscountType === "amount" ? "amount" : "percent";
      const pct = Math.min(90, Math.max(0, Math.round(Number(siteSettings.firstPurchasePercent) || 0)));
      const fixed = Math.min(subtotal, Math.max(0, Math.round(Number(siteSettings.firstPurchaseAmount) || 0)));
      const firstDiscount = firstType === "amount" ? fixed : Math.min(subtotal, Math.round((subtotal * pct) / 100));
      if (firstDiscount > 0) {
        const previous = await hasPreviousFirstPurchaseOrder(phone, req.user?._id);
        if (!previous) {
          discountPercent = firstType === "percent" ? pct : 0;
          discountAmount = firstDiscount;
          discountFixedValue = firstType === "amount" ? firstDiscount : 0;
          discountSource = "first";
        }
      }
    }
    const rawCoupon = str(req.body?.couponCode, { max: 24 });
    if (rawCoupon) {
      // کدهای سراسری تابعِ فعال‌بودن کوپن‌های عمومی‌اند؛ کدهای referral
      // مسیر اعتبارسنجی مستقل دارند و حتی با خاموش‌بودن آن تنظیم قابل‌مصرف‌اند.
      const couponsEnabled = siteSettings.couponEnabled === "1";
      const found = couponsEnabled
        ? findCoupon(parseCouponList(siteSettings.couponCodesJson), rawCoupon)
        : { reason: "notfound" };
      let coupon = found.coupon || null;
      if (!coupon && found.reason === "expired") {
        return res.status(400).json({ error: "تاریخ انقضای این کد تخفیف گذشته است." });
      }
      if (!coupon) {
        const referral = await findOwnedReferralCoupon(rawCoupon, req.user?._id);
        if (referral.coupon) {
          coupon = referral.coupon;
          referralUsedId = referral.referralId;
          referralUsedCode = referral.referralCode;
        } else {
          const referralError = referralCouponError(referral.reason);
          if (referralError) return res.status(400).json({ error: referralError });
          if (!couponsEnabled) {
            return res.status(400).json({ error: "کدهای تخفیف فعلاً غیرفعال هستند." });
          }
          return res.status(400).json({ error: "چنین کد تخفیفی وجود ندارد." });
        }
      }
      // بررسی یک‌بارمصرفی فقط برای کوپن سراسری (کد رفرال با flag خودش می‌سوزد).
      if (!referralUsedId) {
        const usedOr = [{ phone }];
        if (req.user) usedOr.push({ user: req.user._id });
        const CANCELLED = ORDER_STATUSES[ORDER_STATUSES.length - 1];
        const usedBase = { couponCode: coupon.code, $or: usedOr };
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
      }
      if (coupon.minOrder && subtotal < coupon.minOrder) {
        return res.status(400).json({
          error: `این کد تخفیف فقط برای خریدهای بالای ${Number(coupon.minOrder).toLocaleString("fa-IR")} تومان معتبر است.`,
        });
      }
      const amount = couponAmount(subtotal, coupon);
      if (amount > discountAmount) {
        // وقتی کوپن هم درصدی و هم مبلغی است، هرکدام بزرگ‌تر باشد همان ثبت می‌شود.
        const byAmount = coupon.amount > 0 ? Math.min(subtotal, coupon.amount) : 0;
        const byPercent =
          coupon.percent > 0 ? Math.min(subtotal, Math.round((subtotal * coupon.percent) / 100)) : 0;
        if (byAmount >= byPercent) {
          discountPercent = 0;
          discountFixedValue = byAmount; // مبلغِ واقعاً اعمال‌شده (سقف‌خورده)
        } else {
          discountPercent = coupon.percent;
          discountFixedValue = 0;
        }
        discountAmount = amount;
        couponCodeUsed = coupon.code;
        discountSource = "coupon";
      }
    }
    // تخفیف ستاره (وفاداری) هم مانند بقیهٔ تخفیف‌ها؛ بزرگ‌تر اعمال می‌شود.
    // می‌تواند درصدی یا مبلغی باشد — هرکدام مبلغِ تخفیف بزرگ‌تری بدهد همان.
    {
      const starByPercent =
        starBen.discountPercent > 0 ? Math.min(subtotal, Math.round((subtotal * starBen.discountPercent) / 100)) : 0;
      const starByAmount = starBen.discountAmount > 0 ? Math.min(subtotal, starBen.discountAmount) : 0;
      const starAmount = Math.max(starByPercent, starByAmount);
      if (starAmount > 0 && starAmount > discountAmount) {
        if (starByAmount >= starByPercent) {
          discountPercent = 0;
          discountFixedValue = starByAmount; // تخفیف مبلغیِ ستاره
          discountAmount = starByAmount;
        } else {
          discountPercent = starBen.discountPercent;
          discountFixedValue = 0;
          discountAmount = starByPercent;
        }
        couponCodeUsed = "";
        discountSource = "star";
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
    // ستارهٔ ۳+: ارسال رایگان خودکار.
    if (starBen.freeship) {
      shipping.cost = 0;
      shipping.free = true;
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

    // مزایای ستاره‌ای که واقعاً روی این سفارش اعمال شد + منبع هرکدام (ستارهٔ چندم).
    // فقط مزایایی که عملاً اثر گذاشته‌اند ثبت می‌شوند (مثلاً تخفیف ستاره تنها
    // وقتی که برندهٔ «بزرگ‌تر» شده باشد). برای نمایشِ دقیق در فاکتور.
    const perkSrc = starPerkSources(starLevel, starsCfg);
    const starPerksApplied = [];
    const pushPerk = (key) => {
      const s = perkSrc[key];
      if (s) starPerksApplied.push({ key, star: s.star, title: s.title });
    };
    if (starBen.freeship) pushPerk("freeship");
    if (starBen.vipbox) pushPerk("vipbox");
    if (starBen.gift) pushPerk("gift");
    if (discountSource === "star") pushPerk("discount");

    // ---- هدیهٔ وفاداری: انتخابِ خودِ مشتری از استخرِ هدیه ----
    // فقط وقتی مشتری واقعاً مشمولِ هدیه باشد (starBen.gift) و یک محصولِ هدیهٔ
    // معتبرِ فعال و موجود انتخاب کرده باشد، همان به‌صورت رایگان (price=0) به
    // اقلام اضافه می‌شود تا هم موجودی‌اش رزرو شود و هم در فاکتور «هدیه» بیفتد.
    if (starBen.gift) {
      // استخرِ هدیه (+ هدیهٔ دیفالت وقتی ادمین هدیه‌ای علامت نزده) تا خریدِ
      // مشتریِ مشمول هرگز بدون هدیه نماند: انتخابِ نامعتبر/ناموجود هم به اولین
      // هدیهٔ موجودِ استخر برمی‌گردد.
      const pool = await giftPoolProducts();
      const requestedGiftId = int(req.body?.giftId, { min: 1, max: 1e9, clamp: false });
      let gp = requestedGiftId !== null ? pool.find((p) => p.id === requestedGiftId) : null;
      if (!giftInStock(gp)) gp = pool.find(giftInStock) || null;
      // حتی اگر همهٔ هدیه‌های استخر ناموجود باشند، هدیهٔ دیفالت جایگزین می‌شود.
      if (!gp) gp = await defaultGiftProduct();
      if (gp) {
        items.push({
          id: gp.id,
          name: gp.name,
          price: 0,
          qty: 1,
          image: gp.image,
          oldPrice: null,
          festival: false,
          discount: false,
          points: 0,
          sizeMl: gp.sizeMl,
          gift: true,
        });
      }
    }

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
          couponFixed: discountFixedValue,
          couponUseKey: couponCodeUsed ? `${couponCodeUsed}:${phone}` : undefined,
          shippingCod: cod,
          vipBox,
          vipBoxFee,
          starLevel,
          starGift: starBen.gift === true,
          starPerksApplied,
          discountSource,
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
        if (err?.code === 11000) {
          // تصادم روی کلید یکتای کوپن → کد یک‌بارمصرف هم‌زمان استفاده شده است.
          if (err?.keyPattern?.couponUseKey || err?.keyValue?.couponUseKey) {
            await releaseReserved();
            return res
              .status(400)
              .json({ error: "این کد تخفیف هم‌زمان استفاده شد. دوباره تلاش کنید." });
          }
          // در غیر این صورت تصادمِ کد سفارش است → تلاش دوباره با کد جدید.
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

    // v43: اگر کد رفرال یک‌بارمصرف برنده و اعمال شد، همین‌جا می‌سوزد.
    if (referralUsedId && couponCodeUsed === referralUsedCode) {
      await ReferralCode.updateOne(
        { _id: referralUsedId },
        { $set: { used: true, usedAt: new Date(), usedOnOrder: order.code } }
      ).catch(() => {});
    }

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
