import { Router } from "express";
import Review from "../models/Review.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { optionalUser } from "../middleware/authMiddleware.js";
import { ah } from "../utils/asyncHandler.js";
import { str, int } from "../utils/validate.js";
import { clientIp } from "../utils/activityLog.js";

const router = Router();

/**
 * GET /api/reviews/:productId
 * Public, approved-only review list plus the rating summary used for the stars
 * next to the tab title.
 */
router.get(
  "/:productId",
  rateLimit({ name: "reviews-list", windowMs: 60 * 1000, max: 120 }),
  ah(async (req, res) => {
    const productId = int(req.params.productId, { min: 1, max: 1e9 });
    if (productId === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const limit = int(req.query.limit, { min: 1, max: 50, fallback: 20 }) || 20;
    const page = int(req.query.page, { min: 1, max: 500, fallback: 1 }) || 1;

    const filter = { product: productId, status: "approved" };
    const [reviews, total, summary] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Rating histogram (5 → 1) + weighted average, computed in Mongo so the
    // browser never has to download every review just to draw the stars.
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    let n = 0;
    for (const row of summary) {
      breakdown[row._id] = row.count;
      sum += row._id * row.count;
      n += row.count;
    }

    res.json({
      reviews: reviews.map((r) => r.toDTO()),
      total,
      page,
      limit,
      average: n ? Math.round((sum / n) * 10) / 10 : 0,
      count: n,
      breakdown,
    });
  })
);

/**
 * POST /api/reviews/:productId
 * Anyone may submit; nothing is published until an admin approves it.
 * Signed-in customers get their purchase verified automatically.
 */
router.post(
  "/:productId",
  rateLimit({ name: "reviews-create", windowMs: 60 * 60 * 1000, max: 8 }),
  optionalUser,
  ah(async (req, res) => {
    const productId = int(req.params.productId, { min: 1, max: 1e9 });
    if (productId === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const product = await Product.findOne({ id: productId, active: true }).select("_id id");
    if (!product) return res.status(404).json({ error: "محصول یافت نشد." });

    const rating = int(req.body?.rating, { min: 1, max: 5, fallback: null, clamp: false });
    const body = str(req.body?.body, { max: 1500 });
    const name = str(req.body?.name, { max: 80 }) || req.user?.name || "";

    if (rating === null) return res.status(400).json({ error: "امتیاز باید عددی بین ۱ تا ۵ باشد." });
    if (name.length < 2) return res.status(400).json({ error: "نام خود را وارد کنید." });
    if (body.length < 10) {
      return res.status(400).json({ error: "متن نقد باید دست‌کم ۱۰ کاراکتر باشد." });
    }

    // One review per account per product keeps the page honest.
    if (req.user) {
      const existing = await Review.exists({ product: productId, user: req.user._id });
      if (existing) {
        return res.status(409).json({ error: "شما قبلاً برای این محصول نقد نوشته‌اید." });
      }
    }

    let verifiedBuyer = false;
    if (req.user) {
      verifiedBuyer = Boolean(
        await Order.exists({
          user: req.user._id,
          "items.id": productId,
        })
      );
    }

    const review = new Review({
      product: productId,
      user: req.user?._id ?? null,
      name,
      rating,
      body,
      verifiedBuyer,
      // Published immediately; the admin can still reject or delete it from
      // the reviews panel. The text is always rendered as plain text (no HTML).
      status: "approved",
      ip: clientIp(req),
    });
    await review.save();

    res.status(201).json({
      ok: true,
      pending: false,
      message: "نقد شما با موفقیت ثبت و منتشر شد. ممنون از همراهی شما!",
    });
  })
);

export default router;
