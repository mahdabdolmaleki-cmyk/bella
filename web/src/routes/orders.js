import { Router } from "express";
import crypto from "crypto";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { optionalUser } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, int, isPhone, isEmail, isPostalCode, addressIssue } from "../utils/validate.js";
import { isZarinpalConfigured } from "../utils/zarinpal.js";
import { resolveShipping, isProvince, DEFAULT_SHIPPING_METHOD } from "../utils/shipping.js";

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
  optionalUser,
  ah(async (req, res) => {
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

    // SHIPPING: never trust a cost sent by the browser. The courier the buyer
    // picked is re-priced here from the destination province and the real cart
    // weight, so the gateway always charges the amount we computed.
    const { chosen: shipping } = resolveShipping({
      province,
      methodKey: shippingMethodKey,
      items,
      subtotal,
    });
    if (!shipping) {
      return res.status(400).json({ error: "روش ارسالی برای این مقصد در دسترس نیست." });
    }

    const total = subtotal + shipping.cost;

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
            Product.updateOne({ id: r.id }, { $inc: { stock: r.qty } }).catch(() => {})
          )
        );
        return res.status(409).json({
          error: `موجودی «${item.name}» کافی نیست. سبد خرید را به‌روز کنید.`,
        });
      }
      // Negative stock can only happen for back-ordered items; clamp it.
      if (updated.stock < 0) {
        await Product.updateOne({ id: item.id }, { $set: { stock: 0 } }).catch(() => {});
      }
      reserved.push(item);
    }

    const releaseReserved = () =>
      Promise.all(
        reserved.map((r) =>
          Product.updateOne({ id: r.id }, { $inc: { stock: r.qty } }).catch(() => {})
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
          shippingCost: shipping.cost,
          shippingMethod: shipping.key,
          shippingLabel: shipping.label,
          shippingZone: shipping.zone,
          shippingWeightGrams: shipping.weightGrams,
          shippingEtaDays: shipping.etaDays.max,
          freeShipping: shipping.free,
          total,
          user: req.user?._id || null,
          stockCommitted: true,
          paymentStatus: "unpaid",
        });
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    }
    if (!order) {
      // Never keep stock reserved for an order that was not created.
      await releaseReserved();
      return res.status(503).json({ error: "ثبت سفارش ناموفق بود. دوباره تلاش کنید." });
    }

    logActivity(req, {
      action: "order.create",
      target: order.code,
      status: 201,
      meta: `total=${total} shipping=${shipping.key}:${shipping.cost}`,
    });
    res.status(201).json({
      order: order.toDTO(),
      shipping,
      // Tells the frontend whether it should redirect to the gateway.
      payment: { online: isZarinpalConfigured() },
    });
  })
);

export default router;
