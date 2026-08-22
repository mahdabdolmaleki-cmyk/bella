import { Router } from "express";
import Product from "../models/Product.js";
import Settings from "../models/Settings.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { int, bool } from "../utils/validate.js";
import {
  PROVINCES,
  SHIPPING_METHODS,
  DEFAULT_FREE_SHIPPING_THRESHOLD,
  normaliseFreeShippingThreshold,
  quoteShipping,
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
    options: quote.options.map((option) => ({
      key: option.key,
      label: option.label,
      icon: option.icon,
      desc: option.desc,
      cost: option.cost,
      listPrice: option.listPrice,
      free: option.free,
      insurance: option.insurance,
      codFee: option.codFee,
      weightGrams: option.weightGrams,
      billableKg: option.billableKg,
      etaDays: option.etaDays,
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
    res.set("Cache-Control", "no-store");
    res.json({
      provinces: PROVINCES,
      freeThreshold,
      methods: SHIPPING_METHODS.map((method) => ({
        key: method.key,
        label: method.label,
        icon: method.icon,
        desc: method.desc,
        codSupported: method.codSupported,
      })),
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
    });

    res.json({ province, subtotal, ...toPublicQuote(quote) });
  })
);

export default router;
