import { Router } from "express";
import Product from "../models/Product.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { str, int } from "../utils/validate.js";

const router = Router();
// فهرست ثابت حذف شد: دسته‌بندی‌ها را ادمین در تنظیمات سایت می‌سازد، پس
// یک وایت‌لیست سه‌تایی در کد، هر دستهٔ تازه‌ای را بی‌صدا بی‌اثر می‌کرد.
const SORTS = {
  newest: { id: -1 },
  oldest: { id: 1 },
  "price-asc": { price: 1 },
  "price-desc": { price: -1 },
  bestseller: { bestseller: -1, id: 1 },
};

// Escape user input before it reaches a RegExp — otherwise a crafted search
// like "(a+)+$" causes catastrophic backtracking (ReDoS).
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get(
  "/",
  rateLimit({ name: "products-list", windowMs: 60 * 1000, max: 120 }),
  ah(async (req, res) => {
    // BUG FIX: `?search=a&search=b` made req.query.search an array and
    // `.trim()` threw a 500. str() coerces safely and caps the length.
    const search = str(req.query.search, { max: 60 });
    const category = str(req.query.category, { max: 40 });
    const limit = int(req.query.limit, { min: 1, max: 100, fallback: 100 }) || 100;

    // ── فیلترهای صفحهٔ فروشگاه ──────────────────────────────────
    // هر کدام ممکن است چندمقداری باشد (brand=A&brand=B) — مثل هر فروشگاه
    // واقعی که چند برند را هم‌زمان تیک می‌زنید.
    const multi = (value, max = 60) =>
      (Array.isArray(value) ? value : [value])
        .map((v) => str(v, { max }))
        .filter(Boolean)
        .slice(0, 20);

    const brands = multi(req.query.brand, 80);
    const scents = multi(req.query.scent, 120);
    const concentrations = multi(req.query.concentration, 40);
    const seasons = multi(req.query.season, 80);
    const sizes = multi(req.query.size, 20)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));

    const priceMin = int(req.query.priceMin, { min: 0, max: 1e12, fallback: null, clamp: false });
    const priceMax = int(req.query.priceMax, { min: 0, max: 1e12, fallback: null, clamp: false });
    const inStockOnly = req.query.inStock === "1" || req.query.inStock === "true";

    const filter = { active: true };
    if (category && category !== "همه") filter.category = category;
    if (brands.length) filter.brand = { $in: brands };
    if (concentrations.length) filter.concentration = { $in: concentrations };
    if (sizes.length) filter.sizeMl = { $in: sizes };

    // فصل و رایحه متن آزادند («بهار، پاییز»)، پس باید درونشان جست‌وجو کرد
    // نه برابری دقیق.
    if (seasons.length) {
      filter.season = { $in: seasons.map((s) => new RegExp(escapeRegex(s), "i")) };
    }
    if (scents.length) {
      const rxs = scents.map((s) => new RegExp(escapeRegex(s), "i"));
      filter.$and = [
        {
          $or: [
            { scentType: { $in: rxs } },
            { scentStructure: { $in: rxs } },
            { topNotes: { $in: rxs } },
            { heartNotes: { $in: rxs } },
            { baseNotes: { $in: rxs } },
          ],
        },
      ];
    }

    if (priceMin !== null || priceMax !== null) {
      filter.price = {};
      if (priceMin !== null) filter.price.$gte = priceMin;
      if (priceMax !== null) filter.price.$lte = priceMax;
    }

    if (inStockOnly) {
      filter.$or = [{ stock: { $gt: 0 } }, { allowBackorder: true }];
    }

    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      const searchOr = [
        { name: rx },
        { nameEn: rx },
        { tagline: rx },
        { brand: rx },
        { topNotes: rx },
        { heartNotes: rx },
        { baseNotes: rx },
      ];
      // BUG GUARD: اگر inStock هم فعال باشد، دو تا $or روی هم می‌افتادند و دومی
      // اولی را خاموش می‌کرد؛ پس در این حالت به $and منتقل می‌شود.
      if (filter.$or) {
        filter.$and = [...(filter.$and || []), { $or: searchOr }];
      } else {
        filter.$or = searchOr;
      }
    }

    const sortKey = str(req.query.sort, { max: 20 });
    const sort = SORTS[sortKey] || { id: 1 };

    const products = await Product.find(filter).sort(sort).limit(limit);
    res.json({ products: products.map((p) => p.toDTO()) });
  })
);

/**
 * GET /api/products/filters
 *
 * مقادیر ممکن برای نوار فیلتر — از خود محصولات خوانده می‌شود نه از یک
 * فهرست دستی، تا با اضافه شدن هر محصول جدید خودبه‌خود به‌روز شود.
 * فقط «دسته‌بندی» است که ادمین در تنظیمات سایت تعیینش می‌کند.
 */
router.get(
  "/filters",
  rateLimit({ name: "products-filters", windowMs: 60 * 1000, max: 60 }),
  ah(async (_req, res) => {
    const [brands, categories, concentrations, seasons, scentTypes, sizes, range] =
      await Promise.all([
        Product.distinct("brand", { active: true }),
        Product.distinct("category", { active: true }),
        Product.distinct("concentration", { active: true }),
        Product.distinct("season", { active: true }),
        Product.distinct("scentType", { active: true }),
        Product.distinct("sizeMl", { active: true }),
        Product.aggregate([
          { $match: { active: true } },
          { $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } },
        ]),
      ]);

    // مقادیر چندبخشی مثل «بهار، تابستان» باید به تک‌گزینه بشکنند، وگرنه
    // کاربر مجبور می‌شود دقیقاً همان ترکیب را انتخاب کند.
    const explode = (list) => {
      const out = new Set();
      for (const value of list) {
        for (const part of String(value || "").split(/[\u060c,\u061b;\/]+|\s\u0648\s/)) {
          const clean = part.trim();
          if (clean) out.add(clean);
        }
      }
      return [...out].sort();
    };

    const clean = (list) => list.filter(Boolean).map(String).sort();

    res.json({
      brands: clean(brands),
      categories: clean(categories),
      concentrations: clean(concentrations),
      seasons: explode(seasons),
      scentTypes: explode(scentTypes),
      sizes: sizes.filter((s) => Number.isFinite(s)).sort((a, b) => a - b),
      priceMin: range[0]?.min ?? 0,
      priceMax: range[0]?.max ?? 0,
    });
  })
);

router.get(
  "/:id",
  rateLimit({ name: "products-detail", windowMs: 60 * 1000, max: 120 }),
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });
    const product = await Product.findOne({ id, active: true });
    if (!product) return res.status(404).json({ error: "محصول یافت نشد." });
    res.json({ product: product.toDTO() });
  })
);

/**
 * GET /api/products/:id/related?limit=4
 *
 * عطرهای مشابه — "customers looking at this bottle usually like these".
 * Similarity is computed from what a perfume actually smells like rather than
 * from purchase history, so it works from day one with no order data:
 *   • shared scent notes (top / heart / base)  — the strongest signal
 *   • same scent family / structure / season
 *   • same brand or the same category (زنانه/مردانه/یونیسکس)
 *   • a close price bracket, so we never answer a 2M toman bottle with a 30M one
 */
router.get(
  "/:id/related",
  rateLimit({ name: "products-related", windowMs: 60 * 1000, max: 120 }),
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });
    const limit = int(req.query.limit, { min: 1, max: 12, fallback: 4 }) || 4;

    const base = await Product.findOne({ id, active: true }).lean();
    if (!base) return res.status(404).json({ error: "محصول یافت نشد." });

    const others = await Product.find({ active: true, id: { $ne: id } }).limit(200);

    // Split a notes field into comparable words (، / , / و / ـ are all used by admins).
    const words = (value) =>
      String(value || "")
        .split(/[\u060c,\u061b;\/\-\n]+|\s\u0648\s/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length > 2);

    const baseNotes = new Set([
      ...words(base.topNotes),
      ...words(base.heartNotes),
      ...words(base.baseNotes),
      ...words(base.scentType),
    ]);
    const baseSeason = new Set(words(base.season));

    const scored = others.map((p) => {
      let score = 0;

      const notes = new Set([
        ...words(p.topNotes),
        ...words(p.heartNotes),
        ...words(p.baseNotes),
        ...words(p.scentType),
      ]);
      for (const n of notes) if (baseNotes.has(n)) score += 4;

      for (const s of words(p.season)) if (baseSeason.has(s)) score += 2;

      if (base.category && p.category === base.category) score += 3;
      if (base.brand && p.brand === base.brand) score += 3;
      if (base.concentration && p.concentration === base.concentration) score += 1;
      if (base.suitableFor && p.suitableFor === base.suitableFor) score += 1;

      // Price affinity: full marks inside ±35%, nothing beyond ±120%.
      if (base.price > 0 && p.price > 0) {
        const gap = Math.abs(p.price - base.price) / base.price;
        if (gap <= 0.35) score += 3;
        else if (gap <= 0.7) score += 1.5;
        else if (gap > 1.2) score -= 1.5;
      }

      if (p.bestseller) score += 0.75; // gentle nudge, never the deciding factor

      return { p, score };
    });

    scored.sort((a, b) => b.score - a.score || b.p.price - a.p.price);

    res.json({
      products: scored.slice(0, limit).map((row) => row.p.toDTO()),
    });
  })
);

/**
 * GET /api/products/:id/related?limit=4
 *
 * «عطرهای مشابه» for the product page. Similarity is computed from what a
 * perfume actually smells like instead of from purchase history, so it works
 * from day one with an empty orders collection:
 *   • shared scent notes (top / heart / base) — the strongest signal
 *   • same scent family / season
 *   • same brand, category or concentration
 *   • a close price bracket, so a cheap bottle is never answered with a
 *     ten-times-more-expensive one
 */
router.get(
  "/:id/related",
  rateLimit({ name: "products-related", windowMs: 60 * 1000, max: 120 }),
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });
    const limit = int(req.query.limit, { min: 1, max: 12, fallback: 4 }) || 4;

    const base = await Product.findOne({ id, active: true }).lean();
    if (!base) return res.status(404).json({ error: "محصول یافت نشد." });

    const others = await Product.find({ active: true, id: { $ne: id } }).limit(200);

    // Notes are typed free-form by admins, separated by ، , / - or newlines.
    const words = (value) =>
      String(value || "")
        .toLowerCase()
        .split(/[\u060c\u061b,;\/\-\n\r]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2);

    const baseNotes = new Set([
      ...words(base.topNotes),
      ...words(base.heartNotes),
      ...words(base.baseNotes),
      ...words(base.scentType),
    ]);
    const baseSeason = new Set(words(base.season));

    const scored = others.map((p) => {
      let score = 0;

      const notes = new Set([
        ...words(p.topNotes),
        ...words(p.heartNotes),
        ...words(p.baseNotes),
        ...words(p.scentType),
      ]);
      for (const note of notes) if (baseNotes.has(note)) score += 4;
      for (const season of words(p.season)) if (baseSeason.has(season)) score += 2;

      if (base.category && p.category === base.category) score += 3;
      if (base.brand && p.brand === base.brand) score += 3;
      if (base.concentration && p.concentration === base.concentration) score += 1;
      if (base.suitableFor && p.suitableFor === base.suitableFor) score += 1;

      if (base.price > 0 && p.price > 0) {
        const gap = Math.abs(p.price - base.price) / base.price;
        if (gap <= 0.35) score += 3;
        else if (gap <= 0.7) score += 1.5;
        else if (gap > 1.2) score -= 1.5;
      }

      if (p.bestseller) score += 0.75; // gentle nudge, never the deciding factor

      return { p, score };
    });

    scored.sort((a, b) => b.score - a.score || b.p.price - a.p.price);
    res.json({ products: scored.slice(0, limit).map((row) => row.p.toDTO()) });
  })
);

export default router;
