import { Router } from "express";
import User from "../models/User.js";
import Campaign from "../models/Campaign.js";
import { requireAdmin, requireAdminWrite } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, int } from "../utils/validate.js";
import { sendMailDetailed, announcementMail } from "../utils/mailer.js";

/**
 * اطلاع‌رسانی به مشتریان — announcement e-mails.
 *
 * Mounted on its own prefix (/api/admin/notifications) so, unlike the shared
 * /api/admin mount, a blanket auth guard here cannot accidentally swallow the
 * admin login route.
 *
 * Two modes:
 *   - audience "all"      → every active customer that has an e-mail address
 *   - audience "selected" → only the ids the admin picked in the panel
 */
const router = Router();

// Hard ceiling for one send. Without an outbound queue, blasting tens of
// thousands of messages inside a single request would time out and hammer the
// mail provider's rate limit; the admin can send the rest in a second batch.
const MAX_RECIPIENTS = 500;
// How many messages travel in parallel. Keeps well inside the free tiers of
// Resend/Mailgun while still being much faster than a strict serial loop.
const CONCURRENCY = 4;

router.use(requireAdmin);
router.use(rateLimit({ name: "admin-notify", windowMs: 60 * 1000, max: 60 }));

/* ------------------------------------------------------------------ */
/*  GET /api/admin/notifications/recipients?search=&limit=            */
/*  The picker list: active customers with a usable e-mail address.    */
/* ------------------------------------------------------------------ */
router.get(
  "/recipients",
  ah(async (req, res) => {
    const search = str(req.query.search, { max: 60 });
    const limit = int(req.query.limit, { min: 1, max: 500, fallback: 200 }) || 200;

    const filter = { deletedAt: null, email: { $nin: [null, ""] } };
    if (search) {
      // Escape the term: a stray "(" from the search box must not become a
      // broken regular expression (or a ReDoS vector).
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }

    const [rows, total] = await Promise.all([
      User.find(filter).select("name email phone createdAt").sort({ createdAt: -1 }).limit(limit).lean(),
      User.countDocuments({ deletedAt: null, email: { $nin: [null, ""] } }),
    ]);

    res.json({
      total,
      recipients: rows.map((u) => ({
        id: String(u._id),
        name: u.name || "",
        email: u.email || "",
        phone: u.phone || "",
      })),
    });
  })
);

/* ------------------------------------------------------------------ */
/*  GET /api/admin/notifications/history                              */
/* ------------------------------------------------------------------ */
router.get(
  "/history",
  ah(async (req, res) => {
    const limit = int(req.query.limit, { min: 1, max: 50, fallback: 20 }) || 20;
    const rows = await Campaign.find({}).sort({ createdAt: -1 }).limit(limit);
    res.json({ campaigns: rows.map((c) => c.toDTO()) });
  })
);

/* ------------------------------------------------------------------ */
/*  POST /api/admin/notifications/send                                */
/*  body: { subject, body, audience: "all"|"selected", userIds: [] }   */
/* ------------------------------------------------------------------ */
router.post(
  "/send",
  requireAdminWrite,
  rateLimit({ name: "admin-notify-send", windowMs: 60 * 60 * 1000, max: 20 }),
  ah(async (req, res) => {
    const subject = str(req.body?.subject, { max: 160 });
    const body = str(req.body?.body, { max: 8000 });
    const audience = req.body?.audience === "all" ? "all" : "selected";
    const ids = Array.isArray(req.body?.userIds)
      ? req.body.userIds.map((v) => str(v, { max: 40 })).filter(Boolean).slice(0, MAX_RECIPIENTS)
      : [];

    if (subject.length < 3) {
      return res.status(400).json({ error: "موضوع پیام را بنویسید (دست‌کم ۳ حرف)." });
    }
    if (body.trim().length < 10) {
      return res.status(400).json({ error: "متن پیام خیلی کوتاه است." });
    }
    if (audience === "selected" && ids.length === 0) {
      return res.status(400).json({ error: "دست‌کم یک مشتری را انتخاب کنید." });
    }

    const filter = { deletedAt: null, email: { $nin: [null, ""] } };
    if (audience === "selected") {
      // Only ids that look like ObjectIds reach the query — a malformed id
      // would otherwise throw a CastError and return a 500.
      const clean = ids.filter((id) => /^[a-f\d]{24}$/i.test(id));
      if (clean.length === 0) {
        return res.status(400).json({ error: "فهرست مشتریان انتخابی معتبر نیست." });
      }
      filter._id = { $in: clean };
    }

    const people = await User.find(filter).select("name email").limit(MAX_RECIPIENTS).lean();
    if (people.length === 0) {
      return res.status(404).json({ error: "مشتری‌ای با ایمیل معتبر پیدا نشد." });
    }

    let sent = 0;
    let failed = 0;
    let lastError = "";

    // Simple fixed-size worker pool over the recipient list.
    let cursor = 0;
    async function worker() {
      while (cursor < people.length) {
        const person = people[cursor++];
        const mail = announcementMail(subject, body, person.name);
        try {
          const result = await sendMailDetailed(
            person.email,
            mail.subject,
            mail.text,
            mail.html
          );
          if (result.ok) {
            sent += 1;
          } else {
            failed += 1;
            if (!lastError) lastError = result.error;
          }
        } catch (err) {
          failed += 1;
          if (!lastError) lastError = String(err?.message || err).slice(0, 300);
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, people.length) }, () => worker())
    );

    const campaign = await Campaign.create({
      subject,
      body,
      audience,
      total: people.length,
      sent,
      failed,
      sampleRecipients: people.slice(0, 5).map((p) => p.email),
      lastError,
      sentByLabel: "مدیر اصلی",
    });

    logActivity(req, {
      action: "notify.send",
      target: audience === "all" ? "all-customers" : `${people.length} customers`,
      success: failed === 0,
      status: 200,
      meta: `${subject} | sent=${sent} failed=${failed}`,
    });

    const allFailed = sent === 0;
    res.status(allFailed ? 502 : 200).json({
      ok: failed === 0,
      error: allFailed
        ? `هیچ ایمیلی تحویل سرویس‌دهنده نشد. ${lastError || "تنظیمات سرویس ایمیل را بررسی کنید."}`
        : undefined,
      total: people.length,
      sent,
      failed,
      lastError,
      campaign: campaign.toDTO(),
    });
  })
);

export default router;
