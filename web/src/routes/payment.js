import { Router } from "express";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { optionalUser } from "../middleware/authMiddleware.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, isPhone } from "../utils/validate.js";

/**
 * An order code alone used to be enough to start a payment or read someone
 * else's total. A caller must now either own the order (logged in) or prove
 * knowledge of the phone number the order was placed with.
 */
function mayAccessOrder(req, order, phone) {
  if (req.user?._id && order.user && String(order.user) === String(req.user._id)) return true;
  if (phone && isPhone(phone) && order.phone && order.phone === phone) return true;
  return false;
}
import { requestPayment, verifyPayment, isZarinpalConfigured } from "../utils/zarinpal.js";

const router = Router();

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")[0]
  .trim()
  .replace(/\/$/, "");
const API_BASE_URL = (process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`)
  .trim()
  .replace(/\/$/, "");

function resultRedirect(params) {
  const qs = new URLSearchParams(params).toString();
  return `${PUBLIC_BASE_URL}/payment/result?${qs}`;
}

/** Puts reserved stock back after a failed/abandoned payment. */
async function releaseStock(order) {
  if (!order.stockCommitted) return;
  await Promise.all(
    order.items.map((i) =>
      Product.updateOne({ id: i.id }, { $inc: { stock: i.qty } }).catch(() => {})
    )
  );
  order.stockCommitted = false;
}

// ---------------------------------------------------------------------------
// POST /api/payment/start   { code }  -> { url }
// ---------------------------------------------------------------------------
router.post(
  "/start",
  rateLimit({
    name: "payment-start",
    windowMs: 10 * 60 * 1000,
    max: 15,
    message: "\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u067e\u0631\u062f\u0627\u062e\u062a \u0628\u06cc\u0634 \u0627\u0632 \u062d\u062f \u0645\u062c\u0627\u0632 \u0627\u0633\u062a. \u06a9\u0645\u06cc \u0628\u0639\u062f \u062a\u0644\u0627\u0634 \u06a9\u0646\u06cc\u062f.",
  }),
  optionalUser,
  ah(async (req, res) => {
    if (!isZarinpalConfigured()) {
      return res.status(503).json({ error: "\u062f\u0631\u06af\u0627\u0647 \u067e\u0631\u062f\u0627\u062e\u062a \u0647\u0646\u0648\u0632 \u067e\u06cc\u06a9\u0631\u0628\u0646\u062f\u06cc \u0646\u0634\u062f\u0647 \u0627\u0633\u062a." });
    }
    const code = str(req.body?.code, { max: 32 });
    if (!code) return res.status(400).json({ error: "\u06a9\u062f \u0633\u0641\u0627\u0631\u0634 \u0627\u0644\u0632\u0627\u0645\u06cc \u0627\u0633\u062a." });

    const order = await Order.findOne({ code });
    if (!order) return res.status(404).json({ error: "\u0633\u0641\u0627\u0631\u0634 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f." });
    // AUTHZ: knowing a bare order code is no longer enough to start a payment.
    // 404 (not 403) so the endpoint cannot be used to enumerate valid codes.
    if (!mayAccessOrder(req, order, str(req.body?.phone, { max: 20 }))) {
      return res.status(404).json({ error: "\u0633\u0641\u0627\u0631\u0634 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f." });
    }
    if (order.paymentStatus === "paid") {
      return res.status(409).json({ error: "\u0627\u06cc\u0646 \u0633\u0641\u0627\u0631\u0634 \u0642\u0628\u0644\u0627\u064b \u067e\u0631\u062f\u0627\u062e\u062a \u0634\u062f\u0647 \u0627\u0633\u062a." });
    }
    if (order.total <= 0) {
      return res.status(400).json({ error: "\u0645\u0628\u0644\u063a \u0633\u0641\u0627\u0631\u0634 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a." });
    }

    const out = await requestPayment({
      amount: order.total,
      description: `\u067e\u0631\u062f\u0627\u062e\u062a \u0633\u0641\u0627\u0631\u0634 ${order.code} \u2014 \u0628\u0644\u0651\u0627 \u067e\u0631\u0641\u06cc\u0648\u0645`,
      callbackUrl: `${API_BASE_URL}/api/payment/callback`,
      mobile: order.phone,
    });

    if (!out.ok) {
      logActivity(req, {
        action: "payment.request.failed",
        target: order.code,
        success: false,
        status: 502,
        meta: `code=${out.code ?? "-"}`,
      });
      return res.status(502).json({ error: out.error });
    }

    order.authority = out.authority;
    order.paymentStatus = "pending";
    await order.save();

    logActivity(req, { action: "payment.request", target: order.code, status: 200 });
    res.json({ url: out.url, authority: out.authority });
  })
);

// ---------------------------------------------------------------------------
// GET /api/payment/callback?Authority=...&Status=OK|NOK   (browser return)
// The browser result is NEVER trusted: only the server-side verify decides.
// The handler is idempotent — refreshing the page cannot double-credit.
// ---------------------------------------------------------------------------
router.get(
  "/callback",
  rateLimit({ name: "payment-callback", windowMs: 60 * 1000, max: 60 }),
  ah(async (req, res) => {
    const authority = str(req.query?.Authority ?? req.query?.authority, { max: 100 });
    const gatewayStatus = str(req.query?.Status ?? req.query?.status, { max: 10 }).toUpperCase();

    if (!authority) {
      return res.redirect(resultRedirect({ status: "invalid" }));
    }

    const order = await Order.findOne({ authority });
    if (!order) {
      return res.redirect(resultRedirect({ status: "notfound" }));
    }

    // Already settled — replay of the same callback.
    if (order.paymentStatus === "paid") {
      return res.redirect(
        resultRedirect({ status: "ok", code: order.code, ref: order.refId || "" })
      );
    }

    if (gatewayStatus !== "OK") {
      order.paymentStatus = "failed";
      await releaseStock(order);
      await order.save();
      logActivity(req, {
        action: "payment.cancelled",
        target: order.code,
        success: false,
        status: 200,
      });
      return res.redirect(resultRedirect({ status: "cancelled", code: order.code }));
    }

    const verified = await verifyPayment({ amount: order.total, authority });
    if (!verified.ok) {
      order.paymentStatus = "failed";
      await releaseStock(order);
      await order.save();
      logActivity(req, {
        action: "payment.verify.failed",
        target: order.code,
        success: false,
        status: 402,
        meta: `code=${verified.code ?? "-"}`,
      });
      return res.redirect(resultRedirect({ status: "failed", code: order.code }));
    }

    order.paymentStatus = "paid";
    order.refId = verified.refId;
    order.cardPan = verified.cardPan || null;
    order.paidAt = new Date();
    await order.save();

    logActivity(req, {
      action: "payment.paid",
      target: order.code,
      status: 200,
      meta: `ref=${verified.refId} amount=${order.total}`,
    });
    res.redirect(resultRedirect({ status: "ok", code: order.code, ref: verified.refId }));
  })
);

// GET /api/payment/status/:code -> lightweight polling for the result page
router.get(
  "/status/:code",
  rateLimit({ name: "payment-status", windowMs: 60 * 1000, max: 60 }),
  optionalUser,
  ah(async (req, res) => {
    const code = str(req.params?.code, { max: 32 });
    const order = await Order.findOne({ code }).select(
      "code total subtotal shippingCost shippingLabel shippingEtaDays freeShipping " +
        "paymentStatus refId paidAt status timeline user phone"
    );
    if (!order) return res.status(404).json({ error: "\u0633\u0641\u0627\u0631\u0634 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f." });
    // AUTHZ: the result page passes ?phone= so a guest can poll only their own
    // order. Previously any code leaked the total and payment state.
    if (!mayAccessOrder(req, order, str(req.query?.phone, { max: 20 }))) {
      return res.status(404).json({ error: "\u0633\u0641\u0627\u0631\u0634 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f." });
    }
    res.json({
      code: order.code,
      total: order.total,
      // The result page shows the same breakdown as the checkout drawer, so a
      // buyer can see exactly what the shipping part of the charge was.
      subtotal: order.subtotal ?? Math.max(0, order.total - (order.shippingCost || 0)),
      shippingCost: order.shippingCost || 0,
      shippingLabel: order.shippingLabel || "",
      shippingEtaDays: order.shippingEtaDays || 0,
      freeShipping: Boolean(order.freeShipping),
      paymentStatus: order.paymentStatus,
      refId: order.refId ?? null,
      paidAt: order.paidAt ?? null,
      status: order.status,
      timeline: (order.timeline || []).map((t) => ({ status: t.status, at: t.at })),
    });
  })
);

export default router;
