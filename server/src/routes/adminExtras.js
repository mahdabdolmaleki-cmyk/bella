import { Router } from "express";
import Review from "../models/Review.js";
import Order from "../models/Order.js";
import Visit from "../models/Visit.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import { requireAdmin, requireAdminWrite } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, int } from "../utils/validate.js";

/**
 * Admin endpoints that were added after the first release: review moderation
 * and the dashboard statistics used by the bar charts.
 *
 * They live in their own router (mounted on /api/admin BEFORE the main admin
 * router) so the already very long routes/admin.js does not keep growing.
 * Auth is enforced here too — never rely on the mount order for security.
 */
const router = Router();

const TZ = process.env.STATS_TIMEZONE || "Asia/Tehran";

// BUG FIX: this router is mounted on /api/admin BEFORE the main admin router,
// so a blanket `router.use(requireAdmin)` also ran for /api/admin/login and
// /api/admin/recovery-target and answered them with 401 "\u062f\u0633\u062a\u0631\u0633\u06cc \u063a\u06cc\u0631\u0645\u062c\u0627\u0632." — nobody could sign in.
// The guard now only protects the paths this router actually owns; everything
// else falls through untouched to routes/admin.js.
const OWNED_PREFIXES = ["/reviews", "/stats", "/order-status-counts", "/summary"];

function ownsPath(path) {
  return OWNED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

const extrasRateLimit = rateLimit({ name: "admin-extras", windowMs: 60 * 1000, max: 200 });

router.use((req, res, next) => {
  if (!ownsPath(req.path)) return next();
  return requireAdmin(req, res, next);
});

router.use((req, res, next) => {
  if (!ownsPath(req.path)) return next();
  return extrasRateLimit(req, res, next);
});

// ===========================================================================
// REVIEWS — moderation queue, reply, delete
// ===========================================================================

/** GET /api/admin/reviews?status=pending|approved|rejected|all&product=12 */
router.get(
  "/reviews",
  ah(async (req, res) => {
    const status = str(req.query.status, { max: 20 });
    const product = int(req.query.product, { min: 1, max: 1e9, fallback: null });
    const search = str(req.query.search, { max: 60 });
    const limit = int(req.query.limit, { min: 1, max: 200, fallback: 100 }) || 100;
    const page = int(req.query.page, { min: 1, max: 1000, fallback: 1 }) || 1;

    const filter = {};
    if (["pending", "approved", "rejected"].includes(status)) filter.status = status;
    if (product !== null) filter.product = product;
    if (search) {
      // Escaped: a crafted search must not become a catastrophic RegExp.
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { body: rx }];
    }

    const [reviews, total, pendingCount, products] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Review.countDocuments(filter),
      Review.countDocuments({ status: "pending" }),
      Product.find().select("id name").sort({ id: 1 }),
    ]);

    const names = new Map(products.map((p) => [p.id, p.name]));

    res.json({
      reviews: reviews.map((r) => ({
        ...r.toAdminDTO(),
        productName: names.get(r.product) || `#${r.product}`,
      })),
      total,
      page,
      limit,
      pendingCount,
    });
  })
);

/**
 * PATCH /api/admin/reviews/:id  { status?, reply? }
 * Used for approve / reject and for answering the customer.
 */
router.patch(
  "/reviews/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر." });

    const review = await Review.findOne({ id });
    if (!review) return res.status(404).json({ error: "نقد یافت نشد." });

    const status = str(req.body?.status, { max: 20 });
    if (status) {
      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "وضعیت نامعتبر است." });
      }
      review.status = status;
    }

    if (req.body?.reply !== undefined) {
      const body = str(req.body.reply, { max: 1500 });
      if (body) {
        review.reply = {
          body,
          author: str(req.body?.replyAuthor, { max: 80 }) || "مدیر اصلی",
          at: new Date(),
        };
      } else {
        // An empty string removes the answer.
        review.reply = { body: "", author: "", at: null };
      }
    }

    await review.save();
    logActivity(req, {
      action: "review.update",
      target: `#${review.id}`,
      status: 200,
      meta: `status=${review.status} replied=${Boolean(review.reply?.body)}`,
    });
    res.json({ review: review.toAdminDTO() });
  })
);

/** DELETE /api/admin/reviews/:id */
router.delete(
  "/reviews/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر." });
    const review = await Review.findOneAndDelete({ id });
    if (!review) return res.status(404).json({ error: "نقد یافت نشد." });
    logActivity(req, { action: "review.delete", target: `#${id}`, status: 200 });
    res.json({ ok: true });
  })
);

// ===========================================================================
// STATS — daily / weekly / monthly bars for sales, order count and visits
// ===========================================================================

const RANGES = {
  daily: { days: 14, label: "روزانه" },
  weekly: { days: 7 * 12, label: "هفتگی" },
  monthly: { days: 365, label: "ماهانه" },
};

/** "2026-08-04" -> Date at local noon, safe for arithmetic. */
function parseDay(day) {
  return new Date(`${day}T12:00:00.000Z`);
}

/** ISO-ish week key: Saturday-based, matching the Iranian week. */
function weekKey(day) {
  const d = parseDay(day);
  // getUTCDay(): 0=Sunday … 6=Saturday. Shift so Saturday starts the week.
  const shift = (d.getUTCDay() + 1) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

function monthKey(day) {
  return day.slice(0, 7);
}

router.get(
  "/stats",
  ah(async (req, res) => {
    const rangeName = str(req.query.range, { max: 12 });
    const range = RANGES[rangeName] ? rangeName : "daily";
    const since = new Date(Date.now() - RANGES[range].days * 86400000);

    // "Real" sales only: every placed order counts as a sale unless it was cancelled.
    const paidMatch = {
      createdAt: { $gte: since },
      status: { $ne: "لغو شد" },
    };

    const [salesRows, visitRows, totals] = await Promise.all([
      Order.aggregate([
        { $match: paidMatch },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
            revenue: { $sum: "$total" },
            orders: { $sum: 1 },
          },
        },
      ]),
      Visit.aggregate([
        { $match: { at: { $gte: since } } },
        { $group: { _id: "$day", visits: { $sum: "$count" } } },
      ]),
      Promise.all([
        Product.estimatedDocumentCount(),
        Order.estimatedDocumentCount(),
        User.countDocuments({ deletedAt: null }),
        Review.countDocuments({ status: "pending" }),
        Order.aggregate([
          {
            $match: {
              status: { $ne: "لغو شد" },
            },
          },
          { $group: { _id: null, revenue: { $sum: "$total" } } },
        ]),
      ]),
    ]);

    // Merge both series on the day key, then fold days into the requested bucket.
    const byDay = new Map();
    const touch = (day) => {
      if (!byDay.has(day)) byDay.set(day, { day, revenue: 0, orders: 0, visits: 0 });
      return byDay.get(day);
    };
    for (const r of salesRows) {
      const row = touch(r._id);
      row.revenue += r.revenue || 0;
      row.orders += r.orders || 0;
    }
    for (const v of visitRows) {
      touch(v._id).visits += v.visits || 0;
    }

    const keyOf =
      range === "daily" ? (d) => d : range === "weekly" ? weekKey : monthKey;

    // Build a continuous axis so days with no sales still render a zero bar —
    // otherwise the chart silently hides the quiet days and looks wrong.
    const buckets = new Map();
    const step = range === "daily" ? 1 : range === "weekly" ? 7 : 30;
    const points = range === "daily" ? 14 : range === "weekly" ? 12 : 12;
    for (let i = points - 1; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * step * 86400000);
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
      const key = keyOf(day);
      if (!buckets.has(key)) buckets.set(key, { key, revenue: 0, orders: 0, visits: 0 });
    }
    for (const row of byDay.values()) {
      const key = keyOf(row.day);
      if (!buckets.has(key)) continue; // outside the visible window
      const b = buckets.get(key);
      b.revenue += row.revenue;
      b.orders += row.orders;
      b.visits += row.visits;
    }

    const series = [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    const [productCount, orderCount, customerCount, pendingReviews, revenueAgg] = totals;

    res.json({
      range,
      timezone: TZ,
      series,
      totals: {
        products: productCount,
        orders: orderCount,
        customers: customerCount,
        pendingReviews,
        revenue: revenueAgg?.[0]?.revenue || 0,
        rangeRevenue: series.reduce((s, b) => s + b.revenue, 0),
        rangeOrders: series.reduce((s, b) => s + b.orders, 0),
        rangeVisits: series.reduce((s, b) => s + b.visits, 0),
      },
    });
  })
);

/** GET /api/admin/order-status-counts — order totals per status, for the chart. */
router.get(
  "/order-status-counts",
  ah(async (_req, res) => {
    const rows = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const payment = await Order.aggregate([
      { $group: { _id: "$paymentStatus", count: { $sum: 1 } } },
    ]);
    res.json({
      byStatus: rows.map((r) => ({ status: r._id || "—", count: r.count })),
      byPayment: payment.map((r) => ({ status: r._id || "—", count: r.count })),
    });
  })
);

/**
 * GET /api/admin/summary — everything the dashboard reports in ONE request.
 *
 * Orders per status and per payment state, messages, reviews, customers,
 * products (including out-of-stock warnings) and revenue for today / 7 days /
 * 30 days. All of it is aggregated by MongoDB, so the browser never downloads
 * whole collections just to count them.
 */
router.get(
  "/summary",
  ah(async (_req, res) => {
    const now = Date.now();
    const startOfToday = new Date(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()) + "T00:00:00"
    );
    const last7 = new Date(now - 7 * 86400000);
    const last30 = new Date(now - 30 * 86400000);

    // Paid (“real”) sales only — every placed order counts as a sale unless it was cancelled.
    const paidOnly = {
      status: { $ne: "\u0644\u063a\u0648 \u0634\u062f" },
    };
    const revenueSince = (since) =>
      Order.aggregate([
        { $match: { ...paidOnly, createdAt: { $gte: since } } },
        { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
      ]);

    const [
      orderStatusRows,
      paymentRows,
      orderTotals,
      revenueAll,
      revenueToday,
      revenue7,
      revenue30,
      messagesTotal,
      messagesToday,
      messages7,
      reviewRows,
      customersTotal,
      customersToday,
      customers30,
      productsTotal,
      productsActive,
      productsOut,
      productsLow,
      visitsToday,
      visits7,
    ] = await Promise.all([
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$total" } } }]),
      Order.aggregate([{ $group: { _id: "$paymentStatus", count: { $sum: 1 } } }]),
      Order.aggregate([
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            today: { $sum: { $cond: [{ $gte: ["$createdAt", startOfToday] }, 1, 0] } },
            last7: { $sum: { $cond: [{ $gte: ["$createdAt", last7] }, 1, 0] } },
          },
        },
      ]),
      Order.aggregate([
        { $match: paidOnly },
        { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
      ]),
      revenueSince(startOfToday),
      revenueSince(last7),
      revenueSince(last30),
      Message.estimatedDocumentCount(),
      Message.countDocuments({ createdAt: { $gte: startOfToday } }),
      Message.countDocuments({ createdAt: { $gte: last7 } }),
      Review.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            avgRating: { $avg: "$rating" },
          },
        },
      ]),
      User.countDocuments({ deletedAt: null }),
      User.countDocuments({ deletedAt: null, createdAt: { $gte: startOfToday } }),
      User.countDocuments({ deletedAt: null, createdAt: { $gte: last30 } }),
      Product.estimatedDocumentCount(),
      Product.countDocuments({ active: true }),
      Product.countDocuments({ active: true, stock: { $lte: 0 } }),
      Product.countDocuments({ active: true, stock: { $gt: 0, $lte: 3 } }),
      Visit.aggregate([
        { $match: { at: { $gte: startOfToday } } },
        { $group: { _id: null, visits: { $sum: "$count" } } },
      ]),
      Visit.aggregate([
        { $match: { at: { $gte: last7 } } },
        { $group: { _id: null, visits: { $sum: "$count" } } },
      ]),
    ]);

    const pick = (rows, key) => rows.find((r) => r._id === key) || {};
    const reviewsOf = (key) => pick(reviewRows, key).count || 0;
    const money = (rows) => ({
      total: rows?.[0]?.total || 0,
      count: rows?.[0]?.count || 0,
    });

    res.json({
      timezone: TZ,
      generatedAt: new Date().toISOString(),
      orders: {
        total: orderTotals?.[0]?.count || 0,
        today: orderTotals?.[0]?.today || 0,
        last7: orderTotals?.[0]?.last7 || 0,
        byStatus: orderStatusRows.map((r) => ({
          status: r._id || "\u2014",
          count: r.count,
          total: r.total || 0,
        })),
        byPayment: paymentRows.map((r) => ({ status: r._id || "\u2014", count: r.count })),
      },
      revenue: {
        all: money(revenueAll).total,
        today: money(revenueToday).total,
        last7: money(revenue7).total,
        last30: money(revenue30).total,
        paidOrders: money(revenueAll).count,
      },
      messages: { total: messagesTotal, today: messagesToday, last7: messages7 },
      reviews: {
        total: reviewRows.reduce((s, r) => s + r.count, 0),
        pending: reviewsOf("pending"),
        approved: reviewsOf("approved"),
        rejected: reviewsOf("rejected"),
        avgRating: Number((pick(reviewRows, "approved").avgRating || 0).toFixed(2)),
      },
      customers: { total: customersTotal, today: customersToday, last30: customers30 },
      products: {
        total: productsTotal,
        active: productsActive,
        inactive: Math.max(0, productsTotal - productsActive),
        outOfStock: productsOut,
        lowStock: productsLow,
      },
      visits: {
        today: visitsToday?.[0]?.visits || 0,
        last7: visits7?.[0]?.visits || 0,
      },
    });
  })
);

export default router;
