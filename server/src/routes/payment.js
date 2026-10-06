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
  zarinpalMode,
  zarinpalErrorText,
  ZARINPAL_MAX_TOMAN,
} from "../utils/zarinpal.js";
import { notifyOrderPlaced } from "../utils/orderNotify.js";

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

// آدرسی که زرین‌پال مشتری را بعد از پرداخت به آن برمی‌گرداند.
// BUG FIX: پیش‌فرض قبلی http://localhost:4000 بود؛ یعنی اگر API_BASE_URL در
// .env نبود، مرورگر مشتری بعد از پرداخت به localhost خودش می‌رفت و سفارش
// هرگز تأیید نمی‌شد. حالا پیش‌فرض همان دامنهٔ سایت است (مسیر /api از طریق
// Next/nginx به بک‌اند می‌رسد) و دامنه با دامنهٔ ثبت‌شده در زرین‌پال یکی است.
const API_BASE_URL = (process.env.API_BASE_URL || PUBLIC_BASE_URL)
  .trim()
  .replace(/\/$/, "");
const CALLBACK_URL = `${API_BASE_URL}/api/payment/callback`;

// یک خط در لاگ PM2 هنگام راه‌اندازی تا وضعیت درگاه بدون حدس معلوم باشد.
{
  const mode = zarinpalMode();
  if (mode.configured) {
    console.log(
      `💳 ZarinPal: ${mode.sandbox ? "SANDBOX (آزمایشی)" : "LIVE (واقعی)"} · ` +
        `merchant ${mode.merchantHint} · currency ${mode.currency} · callback ${CALLBACK_URL}`
    );
    if (/localhost|127\.0\.0\.1/.test(CALLBACK_URL) && process.env.NODE_ENV === "production") {
      console.warn("⚠️  ZarinPal callback روی localhost است — FRONTEND_URL یا PUBLIC_BASE_URL را تنظیم کنید.");
    }
  } else {
    console.log(
      mode.merchantHint
        ? "⚠️  ZarinPal: ZARINPAL_MERCHANT_ID نامعتبر است (باید ۳۶ کاراکتر مثل xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx باشد)."
        : "💳 ZarinPal: پیکربندی نشده — سفارش‌ها بدون پرداخت آنلاین ثبت می‌شوند."
    );
  }
}

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

    // «تنظیمات تراکنش» (v37): خودکار = اعتبارسنجی توسط زرین‌پال در پایان روز.
    const autoVerify = siteSettings?.zarinpalAutoVerify === "1";

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

    // پس‌کرایه: آنلاین فقط قیمت کالاها پرداخت می‌شود؛ کرایه درِ منزل.
    const payable = order.onlinePayable();
    if (payable <= 0) {
      return res.status(400).json({
        error: "مبلغ سفارش معتبر نیست.",
      });
    }

    if (payable > ZARINPAL_MAX_TOMAN) {
      return res.status(400).json({
        error: "سقف هر پرداخت آنلاین ۱۰۰ میلیون تومان است. لطفاً سفارش را در چند بخش ثبت کنید یا با پشتیبانی تماس بگیرید.",
      });
    }

    const out = await requestPayment({
      amount: payable,
      description: `پرداخت سفارش ${order.code} — بلا پرفیوم`,
      callbackUrl: CALLBACK_URL,
      mobile: order.phone,
      email: order.email || undefined,
      orderId: order.code,
      autoVerify,
    });

    if (!out.ok) {
      logActivity(req, {
        action: "payment.request.failed",
        target: order.code,
        success: false,
        status: 502,
        meta: `code=${out.code ?? "-"} ${zarinpalErrorText(out.code)}`,
      });
      console.warn(`ZarinPal request failed for ${order.code}: ${out.code ?? "-"} ${zarinpalErrorText(out.code)}`);

      return res.status(502).json({
        error: out.error,
      });
    }

    // به‌جای order.save() کامل، آپدیت شرطیِ هدفمند: اگر سفارش در فاصلهٔ
    // درخواستِ درگاه منقضی/لغو شده، همین‌جا به «pending» برنمی‌گردد.
    await Order.updateOne(
      { _id: order._id, paymentStatus: { $in: ["unpaid", "pending"] } },
      { $set: { authority: out.authority, paymentStatus: "pending" } }
    );

    logActivity(req, {
      action: "payment.request",
      target: order.code,
      status: 200,
      meta: `auto_verify=${autoVerify ? "خودکار" : "غیرخودکار"}`,
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
    // -----------------------------------------------------------------------
    // سفارش پیش از بازگشت مشتری منقضی شده است (sweeper موجودی را آزاد کرده).
    //
    // عمداً verify نمی‌کنیم. در حالت «غیرخودکار» زرین‌پال پایان‌روز پول را
    // خودکار به مشتری برمی‌گرداند. در حالت «خودکار» (تنظیمات تراکنشِ پنل)
    // مبلغ برداشت می‌شود و عودتش دستی از پنل زرین‌پال است — در لاگ مشخص می‌شود.
    // -----------------------------------------------------------------------
    const fresh = await Order.findById(order._id).select("paymentStatus stockCommitted code refId");
    if (fresh?.paymentStatus === "paid") {
      return res.redirect(
        resultRedirect({ status: "ok", code: fresh.code, ref: fresh.refId || "" })
      );
    }
    if (!fresh || !["unpaid", "pending"].includes(fresh.paymentStatus) || !fresh.stockCommitted) {
      const curSettings = await Settings.getSingleton();
      const expiredInAutoMode = curSettings?.zarinpalAutoVerify === "1";
      logActivity(req, {
        action: "payment.expired_not_verified",
        target: order.code,
        success: false,
        status: 410,
        meta: expiredInAutoMode
          ? "حالت خودکار: مبلغ تا پایان روز برداشت می‌شود — برای عودت به مشتری از پنل زرین‌پال اقدام کنید"
          : "حالت غیرخودکار: مبلغ تأییدنشده پایان‌روز خودکار به مشتری عودت می‌شود",
      });
      return res.redirect(resultRedirect({ status: "expired", code: order.code }));
    }

    // پس‌کرایه: مبلغ درگاه همان مبلغ آنلاین کالاهاست، نه کل سفارش.
    const verified = await verifyPayment({
      amount: order.onlinePayable(),
      authority,
    });

    if (!verified.ok && verified.transport) {
      // v38: درگاه در لحظهٔ verify در دسترس نبود (timeout/network).
      // وضعیت پرداخت «نامعلوم» است — نه رد‌شده. سفارش را pending نگه
      // می‌داریم و موجودی قفل می‌ماند تا sweeper (که خودش یک verify
      // امتحان می‌کند) یا دکمهٔ «بررسی دوباره» مشتری تکلیفش را روشن کند.
      // اگر پرداخت واقعاً انجام نشده باشد، sweeper بعداً منقضی می‌کند و
      // در حالت غیرخودکار پول همان‌طور که هست به مشتری برمی‌گردد.
      logActivity(req, {
        action: "payment.verify.unreachable",
        target: order.code,
        success: false,
        status: 502,
        meta: "وضعیت نامعلوم — سفارش pending ماند",
      });
      return res.redirect(
        resultRedirect({
          status: "retry",
          code: order.code,
        })
      );
    }

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
        meta: `code=${verified.code ?? "-"} ${zarinpalErrorText(verified.code)}`,
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

      // -------------------------------------------------------------------
      // پول همین حالا verify و برداشت شده، ولی در همان چند میلی‌ثانیه
      // sweeper سفارش را منقضی کرد. رها کردنش یعنی «پول گرفته شد، سفارشی
      // نیست». پس موجودی را دوباره رزرو و سفارش را پرداخت‌شده می‌کنیم.
      // (ممکن است موجودی یک واحد منفی شود؛ مدیر در لاگ می‌بیند.)
      // -------------------------------------------------------------------
      const recovered = await Order.findOneAndUpdate(
        { _id: order._id, paymentStatus: "failed", stockCommitted: false },
        {
          $set: {
            paymentStatus: "paid",
            stockCommitted: true,
            refId: verified.refId,
            cardPan: verified.cardPan || null,
            paidAt: new Date(),
          },
        },
        { new: true }
      );
      if (recovered) {
        await Promise.all(
          (recovered.items || []).map((item) =>
            Product.updateOne({ id: item.id }, { $inc: { stock: -item.qty } })
          )
        ).catch((error) =>
          console.error("payment.recovered: could not re-reserve stock", recovered.code, error?.message)
        );
        logActivity(req, {
          action: "payment.paid.recovered",
          target: recovered.code,
          status: 200,
          meta: `ref=${verified.refId} amount=${recovered.total} (سفارش منقضی‌شده بازیابی شد — موجودی را بررسی کنید)`,
        });
        notifyOrderPlaced(recovered);
        return res.redirect(
          resultRedirect({ status: "ok", code: recovered.code, ref: verified.refId })
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

    // پیامک/ایمیل «سفارش ثبت شد» به مشتری + خبر سفارش جدید به مدیر —
    // فقط یک بار، همین‌جا که پرداخت واقعاً تأیید شده است.
    if (!verified.alreadyVerified) notifyOrderPlaced(paidOrder);

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
// POST /api/payment/recheck/:code   { phone? }
//
// v38: «بررسی دوبارهٔ پرداخت» — برای سفارش‌های pending که callback-شان در
// میانهٔ قطعی درگاه گم شده. همان verify سرور-به-سرور و همان گذار اتمیِ
// callback؛ هیچ داده‌ای از مرورگر باور نمی‌شود.
// ---------------------------------------------------------------------------
router.post(
  "/recheck/:code",
  rateLimit({
    name: "payment-recheck",
    windowMs: 5 * 60 * 1000,
    max: 10,
    message: "بررسی دوباره بیش از حد مجاز است. کمی بعد تلاش کنید.",
  }),
  optionalUser,
  ah(async (req, res) => {
    const code = str(req.params?.code, { max: 32 });
    const order = code ? await Order.findOne({ code }) : null;

    if (!order || !mayAccessOrder(req, order, str(req.body?.phone, { max: 20 }))) {
      return res.status(404).json({ error: "سفارش پیدا نشد." });
    }

    if (order.paymentStatus === "paid") {
      return res.json({ paymentStatus: "paid", refId: order.refId || null });
    }

    if (order.paymentStatus !== "pending" || !order.authority) {
      return res.status(409).json({
        error:
          order.paymentStatus === "failed"
            ? "مهلت این سفارش تمام شده است. در صورت کسر مبلغ، تا پایان روز خودکار به حسابتان برمی‌گردد."
            : "این سفارش در وضعیت پرداخت نیست.",
      });
    }

    const verified = await verifyPayment({
      amount: order.onlinePayable(),
      authority: order.authority,
    });

    if (!verified.ok) {
      if (verified.transport) {
        return res.status(502).json({
          paymentStatus: "pending",
          error: "درگاه فعلاً در دسترس نیست. چند دقیقه دیگر دوباره بررسی کنید.",
        });
      }
      // درگاه صریحاً گفت پرداخت موفق نیست → همان رفتار callback: رد + آزادسازی
      const failedOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,
          paymentStatus: { $in: ["unpaid", "pending"] },
          stockCommitted: true,
        },
        { $set: { paymentStatus: "failed" } },
        { new: true }
      );
      if (failedOrder) {
        try {
          await releaseStock(failedOrder);
          await Order.updateOne(
            { _id: failedOrder._id, paymentStatus: "failed", stockCommitted: true },
            { $set: { stockCommitted: false } }
          );
        } catch (error) {
          console.error("payment.recheck: could not release stock", failedOrder.code, error?.message);
        }
      }
      logActivity(req, {
        action: "payment.recheck.failed",
        target: order.code,
        success: false,
        status: 402,
        meta: `code=${verified.code ?? "-"}`,
      });
      return res.status(402).json({
        paymentStatus: "failed",
        error: "پرداخت در بانک تأیید نشد. اگر مبلغی کسر شده، تا پایان روز خودکار عودت می‌شود.",
      });
    }

    let paidOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: { $in: ["unpaid", "pending"] },
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
      { new: true }
    );

    // sweeper قبلاً منقضی‌اش کرده — همان مسیر بازیابی callback (موجودی دوباره
    // رزرو و سفارش پرداخت‌شده می‌شود؛ ممکن است موجودی یک واحد منفی شود).
    if (!paidOrder) {
      paidOrder = await Order.findOneAndUpdate(
        { _id: order._id, paymentStatus: "failed", stockCommitted: false },
        {
          $set: {
            paymentStatus: "paid",
            stockCommitted: true,
            refId: verified.refId,
            cardPan: verified.cardPan || null,
            paidAt: new Date(),
          },
        },
        { new: true }
      );
      if (paidOrder) {
        await Promise.all(
          (paidOrder.items || []).map((item) =>
            Product.updateOne({ id: item.id }, { $inc: { stock: -item.qty } })
          )
        ).catch((error) =>
          console.error("payment.recheck: could not re-reserve stock", paidOrder.code, error?.message)
        );
        logActivity(req, {
          action: "payment.paid.recovered",
          target: paidOrder.code,
          status: 200,
          meta: `ref=${verified.refId} (از مسیر recheck — موجودی را بررسی کنید)`,
        });
        notifyOrderPlaced(paidOrder);
        return res.json({ paymentStatus: "paid", refId: verified.refId });
      }
      const current = await Order.findById(order._id).select("paymentStatus refId");
      if (current?.paymentStatus === "paid") {
        return res.json({ paymentStatus: "paid", refId: current.refId || verified.refId });
      }
      return res.status(409).json({ paymentStatus: current?.paymentStatus, error: "وضعیت سفارش تغییر کرد." });
    }

    logActivity(req, {
      action: "payment.paid",
      target: paidOrder.code,
      status: 200,
      meta: `ref=${verified.refId} amount=${paidOrder.total} (recheck)`,
    });
    notifyOrderPlaced(paidOrder);
    return res.json({ paymentStatus: "paid", refId: verified.refId });
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
        "freeShipping shippingCod paymentStatus refId paidAt status timeline user phone"
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
      shippingCod: Boolean(order.shippingCod),
      // مبلغی که واقعاً از درگاه پرداخت شده/می‌شود (با پس‌کرایه، بدون کرایه).
      onlinePaid: order.onlinePayable(),
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
