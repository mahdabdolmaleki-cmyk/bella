import { Router } from "express";
import Tutorial, { TUTORIAL_BLOCK_TYPES } from "../models/Tutorial.js";
import TutorialComment, {
  TUTORIAL_COMMENT_STATUSES,
} from "../models/TutorialComment.js";
import TutorialVote from "../models/TutorialVote.js";
import { requireAdmin, requireAdminWrite } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { uploadVideo, isRealVideo, removeFile, VIDEO_DIR } from "../middleware/upload.js";
import path from "path";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, int, bool, safeImage } from "../utils/validate.js";

const router = Router();

// BUG FIX (v30): این روتر روی /api/admin و *پیش از* روتر اصلی ادمین سوار می‌شود،
// پس `router.use(requireAdmin)` سراسری، درخواست /api/admin/login و /api/admin/me
// را هم می‌گرفت و با ۴۰۱ «دسترسی غیرمجاز.» پاسخ می‌داد — یعنی هیچ‌کس نمی‌توانست
// وارد پنل شود. دقیقاً همان اشتباهی که قبلاً در adminExtras.js رخ داده بود.
// حالا نگهبان فقط مسیرهایی را می‌بندد که خودِ این فایل صاحبشان است و بقیه
// دست‌نخورده به routes/admin.js می‌رسند.
const OWNED_PREFIXES = ["/tutorials", "/tutorial-comments", "/upload-video"];

function ownsPath(path) {
  return OWNED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

router.use((req, res, next) => {
  if (!ownsPath(req.path)) return next();
  return requireAdmin(req, res, next);
});

/**
 * نشانی ویدئو.
 *
 * مثل تصاویر، فقط آپلودهای خودمان یا نشانی https مجاز است. این جلوی
 * javascript: و data: را می‌گیرد — وگرنه کسی که به پنل دسترسی دارد
 * می‌توانست در صفحهٔ آموزش کد تزریق کند.
 */
function safeMedia(value) {
  const raw = str(value, { max: 600 });
  if (!raw) return "";
  // آپلودهای خودمان (از جمله /uploads/videos/… که در v31 اضافه شد)
  if (/^[/]uploads[/][A-Za-z0-9._/-]+$/.test(raw)) return raw;
  if (/^https:[/][/][A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+$/.test(raw)) return raw;
  return "";
}

/**
 * عکس آموزش — فقط آپلودهای خود سایت.
 *
 * عمداً از safeImage سختگیرانه‌تر است: نشانی https خارجی را next/image در
 * زمان اجرا رد می‌کند مگر دامنه‌اش در next.config ثبت شود، پس اجازهٔ ذخیره‌اش
 * فقط یک عکس شکسته در صفحهٔ آموزش تولید می‌کرد.
 */
function safePicture(value) {
  const raw = str(value, { max: 600 });
  if (!raw) return "";
  const safe = safeImage(raw) || "";
  return /^[/]uploads[/]/.test(safe) ? safe : "";
}

/**
 * بلوک‌های متن/عکس/ویدئو/نکته.
 *
 * بلوک خالی (متنی بدون متن یا رسانه‌ای بدون نشانی) دور ریخته می‌شود، ولی
 * این کار فقط در لحظهٔ ذخیره انجام می‌شود نه در فرم؛ درس گرفته از باگ «نماد
 * جدید بلافاصله پاک می‌شد».
 */
function parseBlocks(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 40)
    .map((raw) => {
      const type = TUTORIAL_BLOCK_TYPES.includes(raw?.type) ? raw.type : "text";
      const text = str(raw?.text, { max: 6000 });
      const src = type === "image" ? safePicture(raw?.src) : safeMedia(raw?.src);
      return { type, text, src };
    })
    .filter((b) => (b.type === "text" || b.type === "note" ? b.text : b.src));
}

function readPayload(body) {
  return {
    title: str(body?.title, { max: 160 }),
    category: str(body?.category, { max: 60 }) || "عمومی",
    excerpt: str(body?.excerpt, { max: 400 }),
    cover: safePicture(body?.cover),
    video: safeMedia(body?.video),
    blocks: parseBlocks(body?.blocks),
    published: bool(body?.published),
    order: int(body?.order, { min: -999, max: 999, fallback: 0 }) ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/*  آپلود ویدئو (v31)                                                */
/* ------------------------------------------------------------------ */
// آپلود عکس در admin.js فقط تصویر قبول می‌کند، پس ویدئو مسیر خودش را دارد.
router.post(
  "/upload-video",
  requireAdminWrite,
  rateLimit({ name: "admin-upload-video", windowMs: 60 * 60 * 1000, max: 30 }),
  // خطای multer (حجم یا فرمت) را خودمان می‌گیریم تا کاربر پیام فارسی ببیند
  // نه ۵۰۰ی خالی.
  (req, res, next) => {
    uploadVideo.single("file")(req, res, (err) => {
      if (!err) return next();
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      return res.status(400).json({
        error: tooBig
          ? "حجم ویدئو نباید از ۱۰۰ مگابایت بیشتر باشد."
          : err.message || "آپلود ویدئو انجام نشد.",
      });
    });
  },
  ah(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "فایلی ارسال نشد." });

    const filePath = path.join(VIDEO_DIR, req.file.filename);
    if (!isRealVideo(filePath)) {
      removeFile(filePath);
      logActivity(req, {
        action: "tutorial-video.rejected",
        target: req.file.originalname,
        success: false,
        status: 400,
      });
      return res.status(400).json({ error: "فایل ارسالی یک ویدئوی معتبر نیست." });
    }

    logActivity(req, { action: "tutorial-video.create", target: req.file.filename, status: 201 });
    res.status(201).json({ url: `/uploads/videos/${req.file.filename}` });
  }),
);

/* ------------------------------------------------------------------ */
/*  مطالب آموزشی                                                  */
/* ------------------------------------------------------------------ */

router.get(
  "/tutorials",
  ah(async (_req, res) => {
    const rows = await Tutorial.find({}).sort({ order: 1, createdAt: -1 }).limit(300);
    res.json({ tutorials: rows.map((t) => t.toAdminDTO()) });
  }),
);

router.post(
  "/tutorials",
  requireAdminWrite,
  rateLimit({ name: "tutorial-create", windowMs: 60 * 1000, max: 30 }),
  ah(async (req, res) => {
    const data = readPayload(req.body);
    if (data.title.length < 3) {
      return res.status(400).json({ error: "عنوان آموزش را وارد کنید." });
    }

    const tutorial = new Tutorial(data);
    await tutorial.save();

    logActivity(req, { action: "tutorial.create", target: String(tutorial.id), status: 201 });
    res.status(201).json({ tutorial: tutorial.toAdminDTO() });
  }),
);

router.put(
  "/tutorials/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const tutorial = await Tutorial.findOne({ id });
    if (!tutorial) return res.status(404).json({ error: "آموزش یافت نشد." });

    const data = readPayload(req.body);
    if (data.title.length < 3) {
      return res.status(400).json({ error: "عنوان آموزش را وارد کنید." });
    }

    Object.assign(tutorial, data);
    await tutorial.save();

    logActivity(req, { action: "tutorial.update", target: String(id) });
    res.json({ tutorial: tutorial.toAdminDTO() });
  }),
);

router.delete(
  "/tutorials/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const removed = await Tutorial.findOneAndDelete({ id });
    if (!removed) return res.status(404).json({ error: "آموزش یافت نشد." });

    // نظرها و رأی‌های یتیم نباید در دیتابیس بمانند.
    await Promise.all([
      TutorialComment.deleteMany({ tutorial: id }),
      TutorialVote.deleteMany({ tutorial: id }),
    ]);

    logActivity(req, { action: "tutorial.delete", target: String(id) });
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ */
/*  نظرات آموزش‌ها                                                */
/* ------------------------------------------------------------------ */

router.get(
  "/tutorial-comments",
  ah(async (req, res) => {
    const status = TUTORIAL_COMMENT_STATUSES.includes(req.query.status)
      ? req.query.status
      : null;
    const filter = status ? { status } : {};

    const [comments, pending] = await Promise.all([
      TutorialComment.find(filter).sort({ createdAt: -1 }).limit(200),
      TutorialComment.countDocuments({ status: "pending" }),
    ]);

    res.json({ comments: comments.map((c) => c.toAdminDTO()), pending });
  }),
);

router.patch(
  "/tutorial-comments/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const comment = await TutorialComment.findOne({ id });
    if (!comment) return res.status(404).json({ error: "نظر یافت نشد." });

    if (TUTORIAL_COMMENT_STATUSES.includes(req.body?.status)) {
      comment.status = req.body.status;
    }

    if (typeof req.body?.reply === "string") {
      const replyBody = str(req.body.reply, { max: 1500 });
      comment.reply = replyBody
        ? { body: replyBody, author: "مدیر اصلی", at: new Date() }
        : { body: "", author: "", at: null };
    }

    await comment.save();
    logActivity(req, { action: "tutorial-comment.update", target: String(id) });
    res.json({ comment: comment.toAdminDTO() });
  }),
);

router.delete(
  "/tutorial-comments/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "شناسه نامعتبر است." });

    const removed = await TutorialComment.findOneAndDelete({ id });
    if (!removed) return res.status(404).json({ error: "نظر یافت نشد." });

    logActivity(req, { action: "tutorial-comment.delete", target: String(id) });
    res.json({ ok: true });
  }),
);

export default router;
