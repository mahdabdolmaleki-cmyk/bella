import { Router } from "express";
import crypto from "crypto";
import Tutorial from "../models/Tutorial.js";
import TutorialComment from "../models/TutorialComment.js";
import TutorialVote from "../models/TutorialVote.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { optionalUser } from "../middleware/authMiddleware.js";
import { ah } from "../utils/asyncHandler.js";
import { str, int } from "../utils/validate.js";
import { clientIp } from "../utils/activityLog.js";

const router = Router();

/**
 * شناسهٔ رأی‌دهنده.
 *
 * کاربر واردشده با شناسهٔ حساب شناخته می‌شود، مهمان با هش آی‌پی.
 * آی‌پی خام را ذخیره نمی‌کنیم تا جدول رأی‌ها خودش به یک لاگ ردیابی تبدیل نشود.
 */
function voterKey(req) {
  if (req.user?._id) return `u:${req.user._id}`;
  const ip = clientIp(req) || "unknown";
  return `ip:${crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}

/**
 * GET /api/tutorials
 * فهرست مطالب منتشرشده همراه فهرست دسته‌هایی که واقعاً مطلب دارند.
 */
router.get(
  "/",
  rateLimit({ name: "tutorials-list", windowMs: 60 * 1000, max: 120 }),
  ah(async (req, res) => {
    const category = str(req.query.category, { max: 60 });
    const search = str(req.query.search, { max: 80 });
    const limit = int(req.query.limit, { min: 1, max: 48, fallback: 24 }) || 24;
    const page = int(req.query.page, { min: 1, max: 500, fallback: 1 }) || 1;

    const filter = { published: true };
    if (category && category !== "همه") filter.category = category;
    if (search) {
      // متن کاربر باید escape شود؛ وگرنه یک «(» ساده کوئری را می‌شکند.
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ title: rx }, { excerpt: rx }, { category: rx }];
    }

    const [rows, total, categories] = await Promise.all([
      Tutorial.find(filter)
        .sort({ order: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Tutorial.countDocuments(filter),
      Tutorial.distinct("category", { published: true }),
    ]);

    res.json({
      tutorials: rows.map((t) => t.toCardDTO()),
      total,
      page,
      limit,
      categories: categories.filter(Boolean).sort(),
    });
  }),
);

/**
 * GET /api/tutorials/:id
 * متن کامل مطلب به‌همراه رأی خود کاربر (تا دکمهٔ درست روشن بماند).
 */
router.get(
  "/:id",
  rateLimit({ name: "tutorials-read", windowMs: 60 * 1000, max: 120 }),
  optionalUser,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const tutorial = await Tutorial.findOne({ id, published: true });
    if (!tutorial) return res.status(404).json({ error: "آموزش یافت نشد." });

    // بازدید را جداگانه و بدون await روی مسیر پاسخ می‌زنیم تا کندی نسازد.
    Tutorial.updateOne({ id }, { $inc: { views: 1 } }).catch(() => {});

    const vote = await TutorialVote.findOne({ tutorial: id, voter: voterKey(req) })
      .select("value")
      .lean();

    res.json({ tutorial: tutorial.toDTO(), myVote: vote?.value ?? 0 });
  }),
);

/**
 * POST /api/tutorials/:id/vote  { value: 1 | -1 | 0 }
 *
 * رأی تکراری جایگزین می‌شود و فرستادن همان رأی قبلی آن را برمی‌دارد
 * (مثل دکمهٔ لایک در هر شبکهٔ اجتماعی). شمارنده‌ها از خود جدول رأی‌ها
 * دوباره شمرده می‌شوند، نه با inc؛ این‌طور عدد هرگز از واقعیت جدا نمی‌افتد.
 */
router.post(
  "/:id/vote",
  rateLimit({ name: "tutorials-vote", windowMs: 60 * 1000, max: 30 }),
  optionalUser,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const raw = int(req.body?.value, { min: -1, max: 1, fallback: null, clamp: false });
    if (raw === null) return res.status(400).json({ error: "رأی نامعتبر است." });

    const exists = await Tutorial.exists({ id, published: true });
    if (!exists) return res.status(404).json({ error: "آموزش یافت نشد." });

    const voter = voterKey(req);
    const current = await TutorialVote.findOne({ tutorial: id, voter });

    let myVote = 0;
    if (raw === 0 || (current && current.value === raw)) {
      await TutorialVote.deleteOne({ tutorial: id, voter });
    } else {
      await TutorialVote.updateOne(
        { tutorial: id, voter },
        { $set: { value: raw } },
        { upsert: true },
      );
      myVote = raw;
    }

    const [likes, dislikes] = await Promise.all([
      TutorialVote.countDocuments({ tutorial: id, value: 1 }),
      TutorialVote.countDocuments({ tutorial: id, value: -1 }),
    ]);
    await Tutorial.updateOne({ id }, { $set: { likes, dislikes } });

    res.json({ ok: true, likes, dislikes, myVote });
  }),
);

/**
 * GET /api/tutorials/:id/comments — فقط نظرهای تأییدشده.
 */
router.get(
  "/:id/comments",
  rateLimit({ name: "tutorial-comments-list", windowMs: 60 * 1000, max: 120 }),
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const limit = int(req.query.limit, { min: 1, max: 50, fallback: 20 }) || 20;
    const page = int(req.query.page, { min: 1, max: 500, fallback: 1 }) || 1;
    const filter = { tutorial: id, status: "approved" };

    const [comments, total] = await Promise.all([
      TutorialComment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      TutorialComment.countDocuments(filter),
    ]);

    res.json({ comments: comments.map((c) => c.toDTO()), total, page, limit });
  }),
);

/**
 * POST /api/tutorials/:id/comments — نظر بلافاصله منتشر می‌شود (مدیر می‌تواند رد/حذف کند).
 * عمداً هیچ امتیاز ستاره‌ای دریافت نمی‌کند.
 */
router.post(
  "/:id/comments",
  rateLimit({ name: "tutorial-comments-create", windowMs: 60 * 60 * 1000, max: 10 }),
  optionalUser,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const exists = await Tutorial.exists({ id, published: true });
    if (!exists) return res.status(404).json({ error: "آموزش یافت نشد." });

    const name = str(req.body?.name, { max: 80 }) || req.user?.name || "";
    const body = str(req.body?.body, { max: 1500 });

    if (name.length < 2) return res.status(400).json({ error: "نام خود را وارد کنید." });
    if (body.length < 5) {
      return res.status(400).json({ error: "متن نظر باید دست‌کم ۵ کاراکتر باشد." });
    }

    const comment = new TutorialComment({
      tutorial: id,
      user: req.user?._id ?? null,
      name,
      body,
      // Published immediately; the admin can still reject or delete it.
      status: "approved",
      ip: clientIp(req),
    });
    await comment.save();

    res.status(201).json({
      ok: true,
      pending: false,
      message: "نظر شما ثبت و منتشر شد. ممنون از همراهی شما!",
    });
  }),
);

export default router;
