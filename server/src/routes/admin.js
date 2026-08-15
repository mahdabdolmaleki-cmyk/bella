import { Router } from "express";
import path from "path";
import Product from "../models/Product.js";
import Order, { ORDER_STATUSES } from "../models/Order.js";
import Message from "../models/Message.js";
import Settings, { NUMERIC_SETTINGS } from "../models/Settings.js";
import User from "../models/User.js";
import {
  readLogs,
  purgeLogs,
  LOG_RETENTION_DAYS,
  LOG_LEVELS,
} from "../utils/fileLog.js";
import { upload, isRealImage, removeFile, UPLOAD_DIR } from "../middleware/upload.js";
import { requireAdmin, requireAdminWrite, requireOwner } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity, clientIp } from "../utils/activityLog.js";
import { releaseOrderStock } from "../jobs/staleOrders.js";
import { SUPER_ADMIN_PHONE, normalizePhone } from "../config/superAdmin.js";
import {
  str,
  num,
  int,
  bool,
  isEmail,
  isHexColor,
  safeImage,
  passwordIssue,
} from "../utils/validate.js";
import { ADMIN_COOKIE, clearCookieOptions } from "../utils/auth.js";

const router = Router();

/**
 * Removes an uploaded product image from disk. Only paths inside
 * /uploads/products are touched, so a crafted value cannot delete other files.
 */
function removeUploadedImage(url) {
  if (typeof url !== "string") return;
  const match = /^\/uploads\/products\/([A-Za-z0-9._-]+)$/.exec(url.trim());
  if (!match) return;
  removeFile(path.join(UPLOAD_DIR, match[1]));
}

/** Shared ?page= / ?limit= parsing for the admin list endpoints. */
function paging(req, defaultLimit = 100, maxLimit = 500) {
  const limit = int(req.query?.limit, { min: 1, max: maxLimit, fallback: defaultLimit }) || defaultLimit;
  const page = int(req.query?.page, { min: 1, max: 10000, fallback: 1 }) || 1;
  return { limit, page, skip: (page - 1) * limit };
}

// ---------------------------------------------------------------------------
// ورود/بازیابی مدیر با رمز عبور حذف شد. مدیر اصلی اکنون فقط از صفحهٔ حساب
// کاربری و با کد یک‌بارمصرفِ شمارهٔ هاردکدشده وارد می‌شود (POST /api/auth/login).
// این روتر دیگر مسیر عمومی ورود یا بازیابی ندارد.
// ---------------------------------------------------------------------------

router.post("/logout", (req, res) => {
  logActivity(req, { action: "admin.logout", status: 200 });
  res.clearCookie(ADMIN_COOKIE, clearCookieOptions());
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Everything below requires a valid admin session.
// ---------------------------------------------------------------------------
router.use(requireAdmin);
router.use(rateLimit({ name: "admin-api", windowMs: 60 * 1000, max: 200 }));

router.get("/me", (_req, res) => {
  res.json({ admin: true });
});

// ---------------------------------------------------------------------------
// Products (admin sees stock; customers never do)
// ---------------------------------------------------------------------------
router.get(
  "/products",
  ah(async (req, res) => {
    const { limit, page, skip } = paging(req, 200, 1000);
    const [products, total] = await Promise.all([
      Product.find().sort({ id: 1 }).skip(skip).limit(limit),
      Product.estimatedDocumentCount(),
    ]);
    res.json({ products: products.map((p) => p.toAdminDTO()), total, page, limit });
  })
);

router.post(
  "/products",
  requireAdminWrite,
  ah(async (req, res) => {
    const data = sanitizeProduct(req.body || {});
    if (!data.name || !data.nameEn || data.price == null) {
      return res.status(400).json({ error: "\u0646\u0627\u0645\u060c \u0646\u0627\u0645 \u0627\u0646\u06af\u0644\u06cc\u0633\u06cc \u0648 \u0642\u06cc\u0645\u062a \u0627\u0644\u0632\u0627\u0645\u06cc \u0627\u0633\u062a." });
    }
    const product = new Product(data);
    await product.save();
    logActivity(req, { action: "product.create", target: product.name, status: 201, meta: `stock=${product.stock}` });
    res.status(201).json({ product: product.toAdminDTO() });
  })
);

router.patch(
  "/products/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "\u0634\u0646\u0627\u0633\u0647 \u0646\u0627\u0645\u0639\u062a\u0628\u0631." });
    const product = await Product.findOne({ id });
    if (!product) return res.status(404).json({ error: "\u0645\u062d\u0635\u0648\u0644 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f." });
    const previousImage = product.image;
    Object.assign(product, sanitizeProduct(req.body || {}, true));
    await product.save();
    // BUG FIX: replacing an image left the old file on disk forever.
    if (previousImage && previousImage !== product.image) removeUploadedImage(previousImage);
    logActivity(req, { action: "product.update", target: product.name, status: 200, meta: `stock=${product.stock}` });
    res.json({ product: product.toAdminDTO() });
  })
);

// Adjust inventory only: POST /products/:id/stock { delta } or { set }
router.post(
  "/products/:id/stock",
  requireAdminWrite,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "\u0634\u0646\u0627\u0633\u0647 \u0646\u0627\u0645\u0639\u062a\u0628\u0631." });

    const setTo = req.body?.set === undefined ? null : int(req.body.set, { min: 0, max: 1000000 });
    const delta = req.body?.delta === undefined ? null : int(req.body.delta, { min: -100000, max: 100000 });

    let product;
    if (setTo !== null) {
      product = await Product.findOneAndUpdate({ id }, { $set: { stock: setTo } }, { new: true });
    } else if (delta !== null) {
      product = await Product.findOneAndUpdate(
        { id },
        [{ $set: { stock: { $max: [0, { $add: ["$stock", delta] }] } } }],
        { new: true }
      );
    } else {
      return res.status(400).json({ error: "\u0645\u0642\u062f\u0627\u0631 \u0645\u0648\u062c\u0648\u062f\u06cc \u0645\u0634\u062e\u0635 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a." });
    }

    if (!product) return res.status(404).json({ error: "\u0645\u062d\u0635\u0648\u0644 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f." });
    logActivity(req, { action: "product.stock", target: product.name, status: 200, meta: `stock=${product.stock}` });
    res.json({ product: product.toAdminDTO() });
  })
);

router.delete(
  "/products/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    if (id === null) return res.status(400).json({ error: "\u0634\u0646\u0627\u0633\u0647 \u0646\u0627\u0645\u0639\u062a\u0628\u0631." });
    const product = await Product.findOne({ id });
    if (!product) return res.status(404).json({ error: "\u0645\u062d\u0635\u0648\u0644 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f." });
    await Product.deleteOne({ id });
    // BUG FIX: the uploaded image used to stay on disk after the product was gone.
    removeUploadedImage(product.image);
    logActivity(req, { action: "product.delete", target: product.name, status: 200 });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
router.get(
  "/orders",
  ah(async (req, res) => {
    // PERF: was an unbounded-ish `.limit(500)` with no way to page through.
    const { limit, page, skip } = paging(req, 100, 500);
    const [orders, total] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.estimatedDocumentCount(),
    ]);
    res.json({ orders: orders.map((o) => o.toDTO()), total, page, limit });
  })
);

router.patch(
  "/orders/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const id = int(req.params.id, { min: 1, max: 1e9 });
    const status = str(req.body?.status, { max: 40 });
    // The courier barcode is optional: an admin may only be updating it, or
    // only the status, or both in one request.
    const hasTracking = req.body?.trackingCode !== undefined;
    const trackingCode = str(req.body?.trackingCode, { max: 60 });
    if (id === null) return res.status(400).json({ error: "\u0634\u0646\u0627\u0633\u0647 \u0646\u0627\u0645\u0639\u062a\u0628\u0631." });
    if (!status && !hasTracking) {
      return res.status(400).json({ error: "\u062a\u063a\u06cc\u06cc\u0631\u06cc \u0628\u0631\u0627\u06cc \u0627\u0639\u0645\u0627\u0644 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a." });
    }
    if (status && !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: "\u0648\u0636\u0639\u06cc\u062a \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a." });
    }
    const order = await Order.findOne({ id });
    if (!order) return res.status(404).json({ error: "\u0633\u0641\u0627\u0631\u0634 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f." });

    // BUG FIX: cancelling an order left its reserved stock locked forever, so
    // the products stayed "out of stock" in the shop.
    const CANCELLED = ORDER_STATUSES[ORDER_STATUSES.length - 1];
    if (status === CANCELLED && order.status !== CANCELLED) {
      await releaseOrderStock(order);
      if (order.paymentStatus !== "paid") order.paymentStatus = "failed";
    }

    if (hasTracking) order.trackingCode = trackingCode;
    // `order.status` is only touched when a status was actually sent, so a
    // tracking-code-only PATCH can never reset the workflow step. The model's
    // pre-save hook appends the timeline entry.
    if (status) order.status = status;
    await order.save();
    logActivity(req, {
      action: "order.status",
      target: order.code,
      status: 200,
      meta: `${status || order.status}${hasTracking ? ` tracking=${trackingCode || "-"}` : ""}`,
    });
    res.json({ order: order.toDTO() });
  })
);

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
router.get(
  "/messages",
  ah(async (req, res) => {
    const { limit, page, skip } = paging(req, 100, 500);
    const [messages, total] = await Promise.all([
      Message.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Message.estimatedDocumentCount(),
    ]);
    res.json({ messages: messages.map((m) => m.toDTO()), total, page, limit });
  })
);

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
function customerDTO(user, stats) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    phoneVerified: Boolean(user.phoneVerified),
    address: user.address || "",
    createdAt: user.createdAt,
    orderCount: stats?.count || 0,
    totalSpent: stats?.total || 0,
  };
}

router.get(
  "/users",
  ah(async (req, res) => {
    const search = str(req.query?.search, { max: 80 });
    const filter = { deletedAt: null };
    if (search) {
      // Escaped, so a user cannot inject a catastrophic regex.
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(safe, "i");
      filter.$or = [{ name: re }, { email: re }, { phone: re }];
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).limit(500);
    const ids = users.map((u) => u._id);
    const agg = await Order.aggregate([
      { $match: { user: { $in: ids } } },
      { $group: { _id: "$user", count: { $sum: 1 }, total: { $sum: "$total" } } },
    ]);
    const statsById = new Map(agg.map((a) => [String(a._id), a]));

    res.json({ users: users.map((u) => customerDTO(u, statsById.get(String(u._id)))) });
  })
);

router.post(
  "/users",
  requireAdminWrite,
  ah(async (req, res) => {
    const name = str(req.body?.name, { max: 80 });
    const email = isEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone) || "";
    const address = str(req.body?.address, { max: 500 });
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name) return res.status(400).json({ error: "\u0646\u0627\u0645 \u0627\u0644\u0632\u0627\u0645\u06cc \u0627\u0633\u062a." });
    if (!email) return res.status(400).json({ error: "\u0627\u06cc\u0645\u06cc\u0644 \u0645\u0639\u062a\u0628\u0631 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f." });
    const pwIssue = passwordIssue(password);
    if (pwIssue) return res.status(400).json({ error: pwIssue });

    if (await User.exists({ email, deletedAt: null })) {
      return res.status(409).json({ error: "\u0627\u06cc\u0646 \u0627\u06cc\u0645\u06cc\u0644 \u0642\u0628\u0644\u0627\u064b \u062b\u0628\u062a \u0634\u062f\u0647 \u0627\u0633\u062a." });
    }

    const user = new User({ name, email, phone, address });
    await user.setPassword(password);
    await user.save();

    logActivity(req, { action: "customer.create", target: email, status: 201 });
    res.status(201).json({ user: customerDTO(user) });
  })
);

router.patch(
  "/users/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, deletedAt: null });
    if (!user) return res.status(404).json({ error: "\u06a9\u0627\u0631\u0628\u0631 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f." });

    if (req.body?.name !== undefined) {
      const name = str(req.body.name, { max: 80 });
      if (!name) return res.status(400).json({ error: "\u0646\u0627\u0645 \u0646\u0645\u06cc\u200c\u062a\u0648\u0627\u0646\u062f \u062e\u0627\u0644\u06cc \u0628\u0627\u0634\u062f." });
      user.name = name;
    }
    if (req.body?.email !== undefined) {
      const email = isEmail(req.body.email);
      if (!email) return res.status(400).json({ error: "\u0627\u06cc\u0645\u06cc\u0644 \u0645\u0639\u062a\u0628\u0631 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f." });
      if (email !== user.email && (await User.exists({ email, deletedAt: null }))) {
        return res.status(409).json({ error: "\u0627\u06cc\u0646 \u0627\u06cc\u0645\u06cc\u0644 \u0642\u0628\u0644\u0627\u064b \u062b\u0628\u062a \u0634\u062f\u0647 \u0627\u0633\u062a." });
      }
      user.email = email;
    }
    if (req.body?.phone !== undefined) {
      user.phone = normalizePhone(req.body.phone) || str(req.body.phone, { max: 20 });
    }
    if (req.body?.address !== undefined) user.address = str(req.body.address, { max: 500 });
    if (req.body?.password) {
      const pwIssue = passwordIssue(req.body.password);
      if (pwIssue) return res.status(400).json({ error: pwIssue });
      await user.setPassword(req.body.password);
    }

    await user.save();
    logActivity(req, { action: "customer.update", target: user.email, status: 200 });
    res.json({ user: customerDTO(user) });
  })
);

// Soft delete: the row is kept (accounting / dispute history) but hidden.
router.delete(
  "/users/:id",
  requireAdminWrite,
  ah(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, deletedAt: null });
    if (!user) return res.status(404).json({ error: "\u06a9\u0627\u0631\u0628\u0631 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f." });

    const stamp = Date.now();
    user.deletedAt = new Date();
    // Free the unique e-mail so the customer can register again later.
    user.email = `deleted+${stamp}@removed.local`;
    user.phone = "";
    await user.save();

    logActivity(req, { action: "customer.delete", target: String(user._id), status: 200 });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Activity log
//
// Nothing is stored in MongoDB: lines live in daily JSONL files on disk
// (utils/fileLog.js). Only important events are recorded — every one of them
// carries the caller IP address.
// ---------------------------------------------------------------------------
router.get(
  "/logs",
  ah(async (req, res) => {
    const search = str(req.query?.search, { max: 80 });
    const actorType = str(req.query?.actorType, { max: 10 });
    const levelInput = str(req.query?.level, { max: 12 });
    const limit = int(req.query?.limit, { min: 1, max: 500, fallback: 200 }) || 200;

    const { logs, scanned, counts, files } = await readLogs({
      search,
      actorType: ["admin", "user", "guest"].includes(actorType) ? actorType : "",
      level: LOG_LEVELS.includes(levelInput) ? levelInput : "",
      limit,
    });

    res.json({
      logs,
      total: scanned,
      counts,
      files,
      storage: "file",
      retentionDays: LOG_RETENTION_DAYS,
    });
  })
);

router.delete(
  "/logs",
  requireOwner,
  ah(async (req, res) => {
    const olderThanDays = int(req.query?.olderThanDays, { min: 0, max: 365, fallback: 0 });
    const deleted = await purgeLogs(olderThanDays);
    logActivity(req, { action: "log.purge", status: 200, meta: `files=${deleted}` });
    res.json({ ok: true, deleted });
  })
);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
router.get(
  "/settings",
  ah(async (_req, res) => {
    const doc = await Settings.getSingleton();
    res.json({ settings: doc.toDTO() });
  })
);

router.put(
  "/settings",
  requireAdminWrite,
  ah(async (req, res) => {
    const doc = await Settings.getSingleton();
    const limits = {
      festivalActive: 6,
      festivalTitle: 120,
      festivalSubtitle: 200,
      footerAbout: 1000,
      // Home-page scroll story (JSON) + bottle colours.
      journeyStages: 4000,
      journeyBottleGlass: 9,
      journeyBottleLiquid: 9,
      // Home-page brand cards (JSON).
      homeBrands: 8000,
      // Section icon choices + feature strip (JSON).
      sectionIcons: 1200,
      homeFeatures: 6000,
      // Footer trust badges (JSON).
      footerBadges: 8000,
      // Shop category names (JSON array of strings).
      shopCategories: 2000,
      // صفحهٔ تماس با ما (v31) — متن بالای شبکه‌های اجتماعی، خود کانال‌ها (JSON)
      // و سه کارت تماس.
      contactSocialIntro: 300,
      contactSocials: 8000,
      contactPhone: 120,
      contactAddress: 300,
      contactHours: 120,
      // ستون ضمانت‌ها در فوتر و حالت تعمیر پرداخت (v33).
      footerGuaranteeTitle: 120,
      footerGuarantees: 1200,
      paymentsDisabled: 4,
      paymentsDisabledNote: 300,
    };
    for (const [key, max] of Object.entries(limits)) {
      if (req.body?.[key] !== undefined) doc[key] = str(req.body[key], { max });
    }
    // Loyalty-club numbers are validated as numbers, not text.
    for (const [key, range] of Object.entries(NUMERIC_SETTINGS)) {
      if (req.body?.[key] === undefined) continue;
      const value = num(req.body[key], { ...range, fallback: null });
      if (value === null) {
        return res.status(400).json({ error: "مقدار عددی واردشده معتبر نیست." });
      }
      doc[key] = Math.round(value);
    }
    // The bottle photo must be an upload path or a plain relative image URL;
    // safeImage() rejects javascript:/data: and other injection attempts.
    if (req.body?.journeyBottleImage !== undefined) {
      const raw = str(req.body.journeyBottleImage, { max: 300 });
      doc.journeyBottleImage = raw ? safeImage(raw) || "" : "";
    }

    // Brand cards must be a valid JSON array, otherwise the home page breaks.
    if (req.body?.homeBrands) {
      try {
        const parsed = JSON.parse(doc.homeBrands);
        if (!Array.isArray(parsed)) throw new Error("not an array");
        if (parsed.length > 40) throw new Error("too many brands");
      } catch {
        return res
          .status(400)
          .json({ error: "فهرست برندها معتبر نیست. از فرم بالا استفاده کنید." });
      }
    }

    // Icon choices must be a JSON object of section -> icon file name.
    if (req.body?.sectionIcons) {
      try {
        const parsed = JSON.parse(doc.sectionIcons);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
      } catch {
        return res
          .status(400)
          .json({ error: "فهرست آیکن‌ها معتبر نیست. از فرم بالا استفاده کنید." });
      }
    }

    // The feature strip must be a JSON array of at most 12 cards.
    if (req.body?.homeFeatures) {
      try {
        const parsed = JSON.parse(doc.homeFeatures);
        if (!Array.isArray(parsed)) throw new Error("not an array");
        if (parsed.length > 12) throw new Error("too many cards");
      } catch {
        return res
          .status(400)
          .json({ error: "فهرست مزیت‌ها معتبر نیست. از فرم بالا استفاده کنید." });
      }
    }

    // Footer trust badges. These render as clickable images in the public
    // footer, so every entry is re-validated here rather than trusted from the
    // admin form: the image must be one of our own uploads (or an https URL)
    // and the link must be http(s). That closes the obvious
    // javascript:/data: injection route into every page of the site.
    if (req.body?.footerBadges) {
      try {
        const parsed = JSON.parse(doc.footerBadges);
        if (!Array.isArray(parsed)) throw new Error("not an array");
        if (parsed.length > 8) throw new Error("too many badges");
        const cleaned = parsed
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            // پیش‌تر هر لینکی که //:https نداشت بی‌صدا خالی می‌شد و نماد در فوتر
            // غیرقابل‌کلیک می‌ماند. حالا پیشوند را خودمان اضافه می‌کنیم؛ ولی
            // پروتکل‌های خطرناک مثل :javascript همچنان حذف می‌شوند.
            const rawLink = str(item.link, { max: 300 });
            const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(rawLink);
            const link = !rawLink
              ? ""
              : /^https?:\/\//i.test(rawLink)
                ? rawLink
                : hasScheme
                  ? ""
                  : "http" + "s://" + rawLink.replace(/^[/]+/, "");
            return {
              title: str(item.title, { max: 80 }),
              image: safeImage(item.image) || "",
              link: /^https?:\/\/[^\s]+$/i.test(link) ? link : "",
            };
          })
          // A badge without an image has nothing to show; drop it silently.
          .filter((badge) => badge.image);
        doc.footerBadges = cleaned.length ? JSON.stringify(cleaned) : "";
      } catch {
        return res
          .status(400)
          .json({ error: "فهرست نمادهای فوتر معتبر نیست. از فرم بالا استفاده کنید." });
      }
    }

    // A malformed story JSON would break the home page — reject it here.
    if (req.body?.journeyStages) {
      try {
        const parsed = JSON.parse(doc.journeyStages);
        if (!Array.isArray(parsed)) throw new Error("not an array");
      } catch {
        return res
          .status(400)
          .json({ error: "متن مراحل صفحه اصلی معتبر نیست. از فرم بالا استفاده کنید." });
      }
    }
    await doc.save();
    logActivity(req, { action: "settings.update", status: 200 });
    res.json({ settings: doc.toDTO() });
  })
);

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
router.post(
  "/upload",
  requireAdminWrite,
  rateLimit({ name: "admin-upload", windowMs: 60 * 60 * 1000, max: 60 }),
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "\u0641\u0627\u06cc\u0644\u06cc \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062f." });

    const filePath = path.join(UPLOAD_DIR, req.file.filename);
    if (!isRealImage(filePath)) {
      removeFile(filePath);
      logActivity(req, { action: "upload.rejected", target: req.file.originalname, success: false, status: 400 });
      return res.status(400).json({ error: "\u0641\u0627\u06cc\u0644 \u0627\u0631\u0633\u0627\u0644\u06cc \u06cc\u06a9 \u062a\u0635\u0648\u06cc\u0631 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a." });
    }
    logActivity(req, { action: "upload.create", target: req.file.filename, status: 201 });
    res.status(201).json({ url: `/uploads/products/${req.file.filename}` });
  })
);

function sanitizeProduct(body, partial = false) {
  const textFields = {
    name: 120,
    nameEn: 120,
    tagline: 200,
    description: 2000,
    topNotes: 200,
    heartNotes: 200,
    baseNotes: 200,
    longevity: 60,
    sillage: 60,
    category: 40,
    badge: 40,
    // Specification sheet shown in the "ویژگی‌های محصول" tab.
    brand: 80,
    manufacturer: 80,
    suitableFor: 40,
    concentration: 40,
    originCountry: 60,
    madeIn: 60,
    scentType: 120,
    scentStructure: 160,
    season: 80,
    longDescription: 6000,
  };
  const out = {};
  for (const [field, max] of Object.entries(textFields)) {
    if (!partial || body[field] !== undefined) out[field] = str(body[field], { max });
  }
  if (!partial || body.glass !== undefined) out.glass = isHexColor(body.glass, "#0e3b26");
  if (!partial || body.liquid !== undefined) out.liquid = isHexColor(body.liquid, "#d4af37");
  if (!partial || body.image !== undefined) out.image = safeImage(body.image);
  if (!partial || body.price !== undefined)
    out.price = num(body.price, { min: 0, max: 1e12, fallback: null });
  if (!partial || body.oldPrice !== undefined)
    out.oldPrice =
      body.oldPrice == null || body.oldPrice === ""
        ? null
        : num(body.oldPrice, { min: 0, max: 1e12, fallback: null });
  if (!partial || body.sizeMl !== undefined)
    out.sizeMl = int(body.sizeMl, { min: 1, max: 10000, fallback: 100 }) || 100;
  // Inventory — admin-only field.
  if (!partial || body.stock !== undefined)
    out.stock = int(body.stock, { min: 0, max: 1000000, fallback: 0 }) ?? 0;
  if (!partial || body.allowBackorder !== undefined)
    out.allowBackorder = bool(body.allowBackorder);
  // Gallery: each entry goes through the same safeImage() check as the main
  // image, so a crafted "javascript:" or off-site URL can never be stored.
  if (!partial || body.gallery !== undefined) {
    const raw = Array.isArray(body.gallery) ? body.gallery : [];
    out.gallery = raw
      .slice(0, 6)
      .map((value) => safeImage(value))
      .filter((value) => typeof value === "string" && value.length > 0);
  }
  if (!partial || body.bestseller !== undefined) out.bestseller = bool(body.bestseller);
  if (!partial || body.active !== undefined) out.active = bool(body.active);
  return out;
}

export default router;
