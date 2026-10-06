import { Router } from "express";
import path from "path";
import Product, {
  PRODUCT_DESCRIPTION_BLOCK_TYPES,
  PRODUCT_HIGHLIGHT_MAX,
} from "../models/Product.js";
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
import {
  upload,
  uploadVideo,
  isRealImage,
  isRealVideo,
  removeFile,
  UPLOAD_DIR,
  VIDEO_DIR,
} from "../middleware/upload.js";
import { requireAdmin, requireAdminWrite, requireOwner } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity, clientIp } from "../utils/activityLog.js";
import { releaseOrderStock } from "../jobs/staleOrders.js";
import {
  str,
  num,
  int,
  bool,
  isHexColor,
  safeImage,
} from "../utils/validate.js";
import { ADMIN_COOKIE, clearCookieOptions } from "../utils/auth.js";
import { requestedLoginMethods } from "../utils/loginMethods.js";
import { notifySms, sendOtpWithTemplate, sendEventSms, getSmsCredit, getLastSmsError } from "../utils/sms.js";
import { notifyEmail } from "../utils/emailNotify.js";
import { isPhone } from "../utils/validate.js";

const router = Router();

/** Removes only product-owned uploads; crafted paths can never escape. */
function removeUploadedProductMedia(url) {
  if (typeof url !== "string") return;
  const match = /^\/uploads\/(products|videos)\/([A-Za-z0-9._-]+)$/.exec(url.trim());
  if (!match) return;
  removeFile(path.join(match[1] === "videos" ? VIDEO_DIR : UPLOAD_DIR, match[2]));
}

function productMediaUrls(product) {
  return new Set(
    [
      product?.image,
      ...(Array.isArray(product?.gallery) ? product.gallery : []),
      ...(Array.isArray(product?.descriptionBlocks)
        ? product.descriptionBlocks.map((block) => block?.src)
        : []),
    ].filter((url) => typeof url === "string" && url.length > 0),
  );
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
    const previousMedia = productMediaUrls(product);
    Object.assign(product, sanitizeProduct(req.body || {}, true));
    await product.save();
    const currentMedia = productMediaUrls(product);
    for (const url of previousMedia) {
      if (!currentMedia.has(url)) removeUploadedProductMedia(url);
    }
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
    for (const url of productMediaUrls(product)) removeUploadedProductMedia(url);
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
    // «بررسی شد» — پرچم درخواست لغوی مشتری پاک می‌شود (وضعیت دست‌نخورده).
    const clearCancelRequest = req.body?.clearCancelRequest === true;
    const hasExclude = req.body?.excludeFromSales !== undefined;
    const excludeFromSales = req.body?.excludeFromSales === true;
    if (id === null) return res.status(400).json({ error: "\u0634\u0646\u0627\u0633\u0647 \u0646\u0627\u0645\u0639\u062a\u0628\u0631." });
    if (!status && !hasTracking && !clearCancelRequest && !hasExclude) {
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
      // لغو شد → به‌صورت پیش‌فرض از گزارش فروش حذف می‌شود (v36)
      order.excludeFromSales = true;
    }

    if (hasTracking) order.trackingCode = trackingCode;
    if (clearCancelRequest) {
      order.cancelRequested = false;
      order.cancelRequestedAt = null;
    }
    if (hasExclude) {
      order.excludeFromSales = excludeFromSales;
    }
    // `order.status` is only touched when a status was actually sent, so a
    // tracking-code-only PATCH can never reset the workflow step. The model's
    // pre-save hook appends the timeline entry.
    const previousStatus = order.status;
    if (status) order.status = status;
    await order.save();
    logActivity(req, {
      action: "order.status",
      target: order.code,
      status: 200,
      meta: `${status || order.status}${hasTracking ? ` tracking=${trackingCode || "-"}` : ""}`,
    });

    // پیامک + ایمیل «وضعیت سفارش تغییر کرد» — فقط برای تغییر واقعی وضعیت
    if (status && status !== previousStatus) {
      notifySms("orderStatus", order.phone, {
        name: order.customerName || "",
        orderId: order.code,
        status,
      }).catch(() => {});
      notifyEmail("orderStatus", order.email, {
        orderId: order.code,
        status,
      }).catch(() => {});
    }
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

// ---------------------------------------------------------------------------
// GET /api/admin/users/:id/orders  (v39)
//
// فاکتورهای خرید یک مشتری برای پنل «مدیریت مشتریان» — دقیقاً همان DTOای
// که خود مشتری در حساب می‌بیند (جمع‌ها و تفکیک‌ها یکی باشند).
// ---------------------------------------------------------------------------
router.get(
  "/users/:id/orders",
  ah(async (req, res) => {
    const user = await User.findById(req.params.id).select("_id");
    if (!user) return res.status(404).json({ error: "کاربر یافت نشد." });

    const limit = int(req.query?.limit, { min: 1, max: 200, fallback: 50 }) || 50;
    const orders = await Order.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    logActivity(req, {
      action: "customer.invoices",
      target: String(user._id),
      status: 200,
      meta: `count=${orders.length}`,
    });
    res.json({ orders: orders.map((o) => o.toDTO()) });
  })
);

// Customer identities are self-service and OTP-verified. Administrators can
// list/search or delete an account, but cannot create customers or edit their
// identity/profile data from the panel or API.

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
    res.json({ settings: doc.toDTO(true) });
  })
);

router.put(
  "/settings",
  requireAdminWrite,
  ah(async (req, res) => {
    const doc = await Settings.getSingleton();

    // Login switches are normalised separately from free-text settings. The
    // server (not only the UI) refuses a configuration that would lock every
    // customer and the owner out of the site.
    const loginMethods = requestedLoginMethods(doc, req.body || {});
    if (!loginMethods.ok) {
      return res.status(400).json({ error: loginMethods.error });
    }
    doc.loginPhoneEnabled = loginMethods.phone;
    doc.loginEmailEnabled = loginMethods.email;

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
      contactEmail: 190,
      contactAddress: 300,
      contactHours: 120,
      // ستون ضمانت‌ها در فوتر و حالت تعمیر پرداخت (v33).
      footerGuaranteeTitle: 120,
      footerGuarantees: 1200,
      paymentsDisabled: 4,
      paymentsDisabledNote: 300,
      zarinpalAutoVerify: 4,
      // صفحهٔ قوانین و مقررات (v34).
      termsTitle: 160,
      termsText: 20000,
      // کارت تخفیف‌ها و تخفیف خرید اول
      discountsBoxActive: 4,
      discountsBoxTitle: 80,
      discountsBoxSubtitle: 160,
      firstPurchaseDiscountEnabled: 4,
      firstPurchasePercent: 4,
      // کدهای تخفیف (v40)
      couponEnabled: 4,
      couponCodesJson: 8000,
      vipBoxEnabled: 4,
      vipBoxTitle: 80,
      vipBoxDesc: 200,
      vipBoxFee: 9,
      // زمان تحویل سفارش
      deliveryEstimateEnabled: 4,
      deliveryDaysPishtaz: 20,
      deliveryDaysTipax: 20,
      deliveryDaysChapar: 20,
      deliveryDaysPeyk: 20,
      shippingTipaxEnabled: 1,
      shippingPishtazEnabled: 1,
      shippingChaparEnabled: 1,
      shippingPeykEnabled: 1,
      // پیامک‌ها — sms.ir.
      smsirLine: 20,
      smsirTemplateId: 12,
      smsirOtpParam: 30,
      smsOtpEnabled: 1,
      smsirOrderPlacedTemplate: 12,
      smsirAdminOrderTemplate: 12,
      smsirOrderStatusTemplate: 12,
      smsirOrderPlacedParams: 150,
      smsirAdminOrderParams: 150,
      smsirOrderStatusParams: 150,
      smsOrderPlacedEnabled: 1,
      smsAdminNotifyEnabled: 1,
      smsAdminPhone: 20,
      smsOrderStatusEnabled: 1,
      abandonedCartEnabled: 1,
      abandonedCartFirstHours: 4,
      abandonedCartSecondHours: 4,
      smsirAbandonedFirstTemplate: 12,
      smsirAbandonedSecondTemplate: 12,
      smsirAbandonedFirstParams: 150,
      smsirAbandonedSecondParams: 150,
      smsAbandonedFirstEnabled: 1,
      smsAbandonedSecondEnabled: 1,
      smsirCancelAdminTemplate: 12,
      smsirCancelAdminParams: 150,
      smsCancelAdminEnabled: 1,
      emailAdmin: 190,
      emailOtpEnabled: 1,
      emailOrderPlacedEnabled: 1,
      emailAdminNotifyEnabled: 1,
      emailOrderStatusEnabled: 1,
      emailAbandonedFirstEnabled: 1,
      emailAbandonedSecondEnabled: 1,
      emailCancelAdminEnabled: 1,
    };
    for (const [key, max] of Object.entries(limits)) {
      if (req.body?.[key] !== undefined) doc[key] = str(req.body[key], { max });
    }
    // روش‌های ارسال: فقط "1" یا "" ذخیره می‌شود و حداقل یک روش باید فعال بماند،
    // وگرنه مشتری هیچ راهی برای ثبت سفارش ندارد.
    const SHIPPING_TOGGLES = [
      "shippingTipaxEnabled",
      "shippingPishtazEnabled",
      "shippingChaparEnabled",
      "shippingPeykEnabled",
    ];
    for (const key of SHIPPING_TOGGLES) {
      if (req.body?.[key] !== undefined) doc[key] = doc[key] === "1" ? "1" : "";
    }
    if (SHIPPING_TOGGLES.every((key) => doc[key] === "")) {
      return res
        .status(400)
        .json({ error: "حداقل یک روش ارسال باید فعال باشد." });
    }
    // شمارهٔ موبایل مدیر برای اطلاع‌رسانی سفارش — اگر پر شده، معتبر باید باشد.
    if (doc.smsAdminNotifyEnabled === "1" && (doc.smsAdminPhone || "").trim()) {
      if (!isPhone(doc.smsAdminPhone)) {
        return res.status(400).json({ error: "شماره موبایل مدیر معتبر نیست (مثل 09121234567)." });
      }
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
    res.json({ settings: doc.toDTO(true) });
  })
);

// ---------------------------------------------------------------------------
// SMS — تست ارسال و بررسی اعتبار (تنظیمات ← پیامک‌ها)
// ---------------------------------------------------------------------------
// نمونه‌مقدارهایی که در پیامک تست جای متغیرها می‌نشینند.
const SMS_TEST_SAMPLES = {
  otp: { code: "123456", minutes: "5" },
  orderPlaced: { name: "مشتری نمونه", orderId: "BL-TEST12", total: "6,490,000" },
  orderPlacedAdmin: { name: "مشتری نمونه", orderId: "BL-TEST12", total: "6,490,000", phone: "09120000000" },
  orderStatus: { name: "مشتری نمونه", orderId: "BL-TEST12", status: "ارسال شد" },
  abandonedFirst: { name: "مشتری نمونه", total: "6,490,000" },
  abandonedSecond: { name: "مشتری نمونه", total: "6,490,000" },
  cancelAdmin: { name: "مشتری نمونه", orderId: "BL-TEST12", total: "6,490,000", phone: "09120000000" },
};

router.post(
  "/sms/test",
  requireAdminWrite,
  ah(async (req, res) => {
    const phone = isPhone(str(req.body?.phone, { max: 20 }));
    const activity = str(req.body?.activity, { max: 20 });
    if (!phone) return res.status(400).json({ error: "شماره موبایل معتبر نیست." });
    const samples = SMS_TEST_SAMPLES[activity];
    if (!samples) return res.status(400).json({ error: "نوع پیامک نامعتبر است." });

    const doc = await Settings.getSingleton();
    const settings = doc.toDTO(true);

    if (activity === "otp") {
      if (settings.smsOtpEnabled !== "1") {
        return res.json({ ok: false, preview: "", error: "پیامک کد تأیید در تنظیمات خاموش است." });
      }
      const delivered = await sendOtpWithTemplate(phone, samples.code, samples);
      const templateId = String(settings.smsirTemplateId || "").replace(/\D/g, "");
      // نام پارامتر همان‌طور که واقعاً ارسال می‌شود نمایش داده شود (بدون # و فاصله).
      const paramName = String(settings.smsirOtpParam || "Code").replace(/[#\s]+/g, "") || "Code";
      return res.json({
        ok: delivered,
        preview: templateId
          ? `قالب ${templateId} — ${paramName}=${samples.code}`
          : "ارسال با متن پیش‌فرض از خط اختصاصی (بدون قالب)",
        error: delivered ? "" : `ارسال پیامک ناموفق بود. ${getLastSmsError()}`,
      });
    }

    const enabledKey =
      activity === "orderPlaced"
        ? "smsOrderPlacedEnabled"
        : activity === "orderPlacedAdmin"
          ? "smsAdminNotifyEnabled"
          : activity === "orderStatus"
            ? "smsOrderStatusEnabled"
            : activity === "abandonedFirst"
              ? "smsAbandonedFirstEnabled"
              : activity === "abandonedSecond"
                ? "smsAbandonedSecondEnabled"
                : "smsCancelAdminEnabled";
    if (settings[enabledKey] !== "1") {
      return res.json({ ok: false, preview: "", error: "این پیامک در تنظیمات خاموش است؛ اول آن را روشن کنید." });
    }
    const r = await sendEventSms(activity, phone, samples);
    res.json({
      ok: r.ok,
      preview: r.preview ? `پارامترها: ${r.preview}` : "",
      error: r.ok ? "" : `ارسال پیامک ناموفق بود. ${r.error || ""}`,
    });
  })
);

router.get(
  "/sms/credit",
  ah(async (_req, res) => {
    const result = await getSmsCredit();
    res.json(result);
  })
);

router.post(
  "/email/test",
  requireAdminWrite,
  ah(async (req, res) => {
    const { isEmail } = await import("../utils/validate.js");
    const to = isEmail(String(req.body?.email || "").trim());
    const activity = String(req.body?.activity || "").trim();
    if (!to) return res.status(400).json({ error: "ایمیل معتبر وارد کنید." });
    const { sendTestEmail } = await import("../utils/emailNotify.js");
    const result = await sendTestEmail(activity, to);
    if (!result.ok) {
      return res.json({ ok: false, error: result.error || "ارسال ایمیل تست ناموفق بود." });
    }
    res.json({ ok: true, messageId: result.messageId || "" });
  })
);



// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
router.post(
  "/upload",
  requireAdminWrite,
  rateLimit({ name: "admin-upload", windowMs: 60 * 60 * 1000, max: 60 }),
  // BUG FIX: قبلاً upload.single مستقیم در زنجیره بود؛ خطای fileFilter
  // (مثل فرمت HEIC یا mimetype نامعتبر) از نوع Error ساده است نه MulterError،
  // پس به هندلر مرکزی می‌افتاد و ادمین «خطای داخلی سرور» (۵۰۰) می‌دید.
  // حالا خودمان می‌گیریم و پیام فارسی درست برمی‌گردانیم — دقیقاً مثل روت ویدئو.
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (!err) return next();
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      return res.status(400).json({
        error: tooBig
          ? "حجم عکس نباید بیشتر از ۱۰ مگابایت باشد."
          : err.message || "آپلود عکس انجام نشد.",
      });
    });
  },
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

router.post(
  "/upload-product-video",
  requireAdminWrite,
  rateLimit({ name: "product-video-upload", windowMs: 60 * 60 * 1000, max: 30 }),
  (req, res, next) => {
    uploadVideo.single("file")(req, res, (err) => {
      if (!err) return next();
      return res.status(400).json({
        error:
          err.code === "LIMIT_FILE_SIZE"
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
        action: "product-video.rejected",
        target: req.file.originalname,
        success: false,
        status: 400,
      });
      return res.status(400).json({ error: "فایل ارسالی یک ویدئوی معتبر نیست." });
    }
    logActivity(req, {
      action: "product-video.create",
      target: req.file.filename,
      status: 201,
    });
    res.status(201).json({ url: `/uploads/videos/${req.file.filename}` });
  })
);

export function sanitizeDescriptionBlocks(input) {
  if (!Array.isArray(input)) return [];
  let textBudget = 24000;

  return input
    .slice(0, 40)
    .map((raw) => {
      const type = PRODUCT_DESCRIPTION_BLOCK_TYPES.includes(raw?.type)
        ? raw.type
        : "text";
      const text = str(raw?.text, { max: Math.min(6000, textBudget) });
      textBudget = Math.max(0, textBudget - text.length);
      // سرتیتر اختیاری هر بلوک (فقط متن معنا دارد؛ برای عکس/ویدئو نادیده گرفته می‌شود).
      const heading = type === "text" ? str(raw?.heading, { max: 120 }) : "";
      const rawSrc = str(raw?.src, { max: 600 });
      const src =
        type === "image"
          ? (/^\/uploads\/products\/[A-Za-z0-9._-]+$/.test(rawSrc) ? rawSrc : "")
          : type === "video"
            ? (/^\/uploads\/videos\/[A-Za-z0-9._-]+$/.test(rawSrc) ? rawSrc : "")
            : "";
      return { type, text, heading, src };
    })
    .filter((block) => (block.type === "text" ? block.text : block.src));
}

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
  if (!partial || body.descriptionBlocks !== undefined) {
    out.descriptionBlocks = sanitizeDescriptionBlocks(body.descriptionBlocks);
  }
  // نمادها و متن‌های ویژهٔ صفحهٔ محصول (آیکن از پکیج خودمان + متن کوتاه).
  if (!partial || body.highlights !== undefined) {
    const rawHighlights = Array.isArray(body.highlights) ? body.highlights : [];
    out.highlights = rawHighlights
      .slice(0, PRODUCT_HIGHLIGHT_MAX)
      .map((h) => {
        const icon = str(h?.icon, { max: 40 });
        return {
          icon: /^[a-z0-9-]{1,40}$/.test(icon) ? icon : "sparkles",
          text: str(h?.text, { max: 90 }),
        };
      })
      .filter((h) => h.text.trim().length > 0);
  }
  // گالری محصول: عکس‌های اضافه‌ای که ادمین در فرم محصول آپلود می‌کند و در
  // صفحهٔ فروشگاه به‌صورت گالری نمایش داده می‌شوند (حداکثر ۱۰ عکس).
  if (!partial || body.gallery !== undefined) {
    const raw = Array.isArray(body.gallery) ? body.gallery : [];
    out.gallery = raw
      .slice(0, 10)
      .map((value) => safeImage(value))
      .filter((value) => typeof value === "string" && value.length > 0);
  }
  if (!partial || body.bestseller !== undefined) out.bestseller = bool(body.bestseller);
  if (!partial || body.active !== undefined) out.active = bool(body.active);
  return out;
}

export default router;
