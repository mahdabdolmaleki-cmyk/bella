import { Router } from "express";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Settings from "../models/Settings.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { optionalUser } from "../middleware/authMiddleware.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, isPhone } from "../utils/validate.js";
import {
  requestPayment,
  verifyPayment,
  isZarinpalConfigured,
} from "../utils/zarinpal.js";

/**
 * An order code alone used to be enough to start a payment or read someone
 * else's total. A caller must now either own the order (logged in) or prove
 * knowledge of the phone number the order was placed with.
 */
function mayAccessOrder(req, order, phone) {
  if (
    req.user?._id &&
    order.user &&
    String(order.user) === String(req.user._id)
  ) {
    return true;
  }

  if (
    phone &&
    isPhone(phone) &&
    order.phone &&
    order.phone === phone
  ) {
    return true;
  }

  return false;
}

const router = Router();

const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ||
  process.env.FRONTEND_URL ||
  "http://localhost:3000"
)
  .split(",")[0]
  .trim()
  .replace(/\/$/, "");

const API_BASE_URL = (
  process.env.API_BASE_URL ||
  `http://localhost:${process.env.PORT || 4000}`
)
  .trim()
  .replace(/\/$/, "");

function resultRedirect(params) {
  const qs = new URLSearchParams(params).toString();
  return `${PUBLIC_BASE_URL}/payment/result?${qs}`;
}

/**
 * Puts reserved stock back after a failed/abandoned payment.
 *
 * IMPORTANT:
 * This function only changes the in-memory order object.
 * The caller is responsible for persisting stockCommitted=false.
 */
async function releaseStock(order) {
  if (!order?.stockCommitted) return;

  await Promise.all(
    (order.items || []).map((item) =>
      Product.updateOne(
        { id: item.id },
        { $inc: { stock: item.qty } }
      )
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
    message:
      "درخواست پرداخت بیش از حد مجاز است. کمی بعد تلاش کنید.",
  }),
  optionalUser,
  ah(async (req, res) => {
    // When maintenance mode is enabled, even old orders must not be sent
    // to the gateway.
    const siteSettings = await Settings.getSingleton();

    if (siteSettings?.paymentsDisabled === "1") {
      return res.status(503).json({
        error:
          (siteSettings.paymentsDisabledNote || "").trim() ||
          "پرداخت موقتاً غیرفعال است. کمی بعد تلاش کنید.",
        maintenance: true,
      });
    }

    if (!isZarinpalConfigured()) {
      return res.status(503).json({
        error: "درگاه پرداخت هنوز پیکربندی نشده است.",
      });
    }

    const code = str(req.body?.code, {
      max: 32,
    });

    if (!code) {
      return res.status(400).json({
        error: "کد سفارش الزامی است.",
      });
    }

    const order = await Order.findOne({
      code,
    });

    if (!order) {
      return res.status(404).json({
        error: "سفارش پیدا نشد.",
      });
    }

    // Knowing the order code alone is not enough.
    if (
      !mayAccessOrder(
        req,
        order,
        str(req.body?.phone, {
          max: 20,
        })
      )
    ) {
      return res.status(404).json({
        error: "سفارش پیدا نشد.",
      });
    }

    if (order.paymentStatus === "paid") {
      return res.status(409).json({
        error: "این سفارش قبلاً پرداخت شده است.",
      });
    }

    if (order.paymentStatus === "failed") {
      return res.status(409).json({
        error:
          "این سفارش منقضی شده یا پرداخت آن ناموفق بوده است. لطفاً سفارش جدیدی ثبت کنید.",
      });
    }

    if (order.total <= 0) {
      return res.status(400).json({
        error: "مبلغ سفارش معتبر نیست.",
      });
    }

    const out = await requestPayment({
      amount: order.total,
      description: `پرداخت سفارش ${order.code} — بلا پرفیوم`,
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

      return res.status(502).json({
        error: out.error,
      });
    }

    order.authority = out.authority;
    order.paymentStatus = "pending";

    await order.save();

    logActivity(req, {
      action: "payment.request",
      target: order.code,
      status: 200,
    });

    return res.json({
      url: out.url,
      authority: out.authority,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/payment/callback?Authority=...&Status=OK|NOK
//
// IMPORTANT:
// The browser callback is NEVER trusted.
//
// The actual payment is accepted only after server-side verification AND
// an atomic transition of the order from unpaid/pending -> paid.
//
// This prevents a stale-order sweeper from releasing the stock and then
// allowing a late payment callback to mark the same order as paid.
// ---------------------------------------------------------------------------
router.get(
  "/callback",
  rateLimit({
    name: "payment-callback",
    windowMs: 60 * 1000,
    max: 60,
  }),
  ah(async (req, res) => {
    const authority = str(
      req.query?.Authority ?? req.query?.authority,
      {
        max: 100,
      }
    );

    const gatewayStatus = str(
      req.query?.Status ?? req.query?.status,
      {
        max: 10,
      }
    ).toUpperCase();

    if (!authority) {
      return res.redirect(
        resultRedirect({
          status: "invalid",
        })
      );
    }

    const order = await Order.findOne({
      authority,
    });

    if (!order) {
      return res.redirect(
        resultRedirect({
          status: "notfound",
        })
      );
    }

    // -----------------------------------------------------------------------
    // Already paid.
    //
    // Replaying the same callback must not create another state transition.
    // -----------------------------------------------------------------------
    if (order.paymentStatus === "paid") {
      return res.redirect(
        resultRedirect({
          status: "ok",
          code: order.code,
          ref: order.refId || "",
        })
      );
    }

    // -----------------------------------------------------------------------
    // Gateway says the user cancelled / payment did not happen.
    //
    // Atomically change only unpaid/pending orders.
    // If the stale-order worker already changed the order to failed,
    // this returns null and we MUST NOT release stock again.
    // -----------------------------------------------------------------------
    if (gatewayStatus !== "OK") {
      const cancelledOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,

          paymentStatus: {
            $in: ["unpaid", "pending"],
          },

          stockCommitted: true,
        },
        {
          $set: {
            paymentStatus: "failed",
          },
        },
        {
          new: true,
        }
      );

      if (!cancelledOrder) {
        return res.redirect(
          resultRedirect({
            status:
              order.paymentStatus === "paid"
                ? "ok"
                : "cancelled",
            code: order.code,
            ref: order.refId || "",
          })
        );
      }

      try {
        await releaseStock(cancelledOrder);

        await Order.updateOne(
          {
            _id: cancelledOrder._id,
            paymentStatus: "failed",
            stockCommitted: true,
          },
          {
            $set: {
              stockCommitted: false,
            },
          }
        );
      } catch (error) {
        console.error(
          "payment.cancelled: could not release stock",
          cancelledOrder.code,
          error?.message
        );

        return res.redirect(
          resultRedirect({
            status: "failed",
            code: cancelledOrder.code,
          })
        );
      }

      logActivity(req, {
        action: "payment.cancelled",
        target: cancelledOrder.code,
        success: false,
        status: 200,
      });

      return res.redirect(
        resultRedirect({
          status: "cancelled",
          code: cancelledOrder.code,
        })
      );
    }

    // -----------------------------------------------------------------------
    // Gateway says OK.
    //
    // We still DO NOT trust the browser.
    // Verify directly with ZarinPal.
    // -----------------------------------------------------------------------
    const verified = await verifyPayment({
      amount: order.total,
      authority,
    });

    if (!verified.ok) {
      // The payment was not verified.
      //
      // We again use an atomic transition so a stale-order worker cannot
      // cause us to release stock twice.
      const failedOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,

          paymentStatus: {
            $in: ["unpaid", "pending"],
          },

          stockCommitted: true,
        },
        {
          $set: {
            paymentStatus: "failed",
          },
        },
        {
          new: true,
        }
      );

      if (failedOrder) {
        try {
          await releaseStock(failedOrder);

          await Order.updateOne(
            {
              _id: failedOrder._id,
              paymentStatus: "failed",
              stockCommitted: true,
            },
            {
              $set: {
                stockCommitted: false,
              },
            }
          );
        } catch (error) {
          console.error(
            "payment.verify.failed: could not release stock",
            failedOrder.code,
            error?.message
          );
        }
      }

      logActivity(req, {
        action: "payment.verify.failed",
        target: order.code,
        success: false,
        status: 402,
        meta: `code=${verified.code ?? "-"}`,
      });

      return res.redirect(
        resultRedirect({
          status: "failed",
          code: order.code,
        })
      );
    }

    // -----------------------------------------------------------------------
    // Payment was verified by ZarinPal.
    //
    // CRITICAL:
    // Do NOT use order.save() here.
    //
    // We atomically allow payment only if the order is still unpaid/pending
    // AND its stock reservation still exists.
    //
    // If the stale-order worker already claimed the order and released stock,
    // this update returns null and the late callback is NOT allowed to mark
    // the order as paid.
    // -----------------------------------------------------------------------
    const paidOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,

        paymentStatus: {
          $in: ["unpaid", "pending"],
        },

        stockCommitted: true,
      },
      {
        $set: {
          paymentStatus: "paid",
          refId: verified.refId,
          cardPan: verified.cardPan || null,
          paidAt: new Date(),
        },
      },
      {
        new: true,
      }
    );

    // -----------------------------------------------------------------------
    // Another state transition won the race.
    //
    // Most likely:
    // stale-order sweeper -> failed
    //
    // We must NOT overwrite that state with paid.
    // -----------------------------------------------------------------------
    if (!paidOrder) {
      const currentOrder = await Order.findById(order._id).select(
        "paymentStatus code refId"
      );

      if (currentOrder?.paymentStatus === "paid") {
        return res.redirect(
          resultRedirect({
            status: "ok",
            code: currentOrder.code,
            ref: currentOrder.refId || verified.refId || "",
          })
        );
      }

      logActivity(req, {
        action: "payment.paid.race_rejected",
        target: order.code,
        success: false,
        status: 409,
        meta: `ref=${verified.refId} amount=${order.total}`,
      });

      return res.redirect(
        resultRedirect({
          status: "failed",
          code: order.code,
        })
      );
    }

    // -----------------------------------------------------------------------
    // Payment successfully transitioned the order to paid.
    // Stock remains committed and therefore must NOT be released.
    // -----------------------------------------------------------------------

    logActivity(req, {
      action: "payment.paid",
      target: paidOrder.code,
      status: 200,
      meta: `ref=${verified.refId} amount=${paidOrder.total}`,
    });

    return res.redirect(
      resultRedirect({
        status: "ok",
        code: paidOrder.code,
        ref: verified.refId,
      })
    );
  })
);

// ---------------------------------------------------------------------------
// GET /api/payment/status/:code
//
// Lightweight polling for the result page.
// ---------------------------------------------------------------------------
router.get(
  "/status/:code",
  rateLimit({
    name: "payment-status",
    windowMs: 60 * 1000,
    max: 60,
  }),
  optionalUser,
  ah(async (req, res) => {
    const code = str(req.params?.code, {
      max: 32,
    });

    const order = await Order.findOne({
      code,
    }).select(
      "code total subtotal shippingCost shippingLabel shippingEtaDays " +
        "freeShipping paymentStatus refId paidAt status timeline user phone"
    );

    if (!order) {
      return res.status(404).json({
        error: "سفارش پیدا نشد.",
      });
    }

    // The result page passes ?phone= so a guest can poll only their own order.
    if (
      !mayAccessOrder(
        req,
        order,
        str(req.query?.phone, {
          max: 20,
        })
      )
    ) {
      return res.status(404).json({
        error: "سفارش پیدا نشد.",
      });
    }

    return res.json({
      code: order.code,
      total: order.total,

      subtotal:
        order.subtotal ??
        Math.max(
          0,
          order.total - (order.shippingCost || 0)
        ),

      shippingCost: order.shippingCost || 0,
      shippingLabel: order.shippingLabel || "",
      shippingEtaDays: order.shippingEtaDays || 0,
      freeShipping: Boolean(order.freeShipping),

      paymentStatus: order.paymentStatus,

      refId: order.refId ?? null,
      paidAt: order.paidAt ?? null,

      status: order.status,

      timeline: (order.timeline || []).map((item) => ({
        status: item.status,
        at: item.at,
      })),
    });
  })
);

export default router;