import { Router } from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { issueOtp, verifyOtp, OTP_RESEND_SECONDS } from "../utils/otp.js";
import { logActivity } from "../utils/activityLog.js";
import {
  normalizePhone,
  isSuperAdminPhone,
  maskPhone,
  isSuperAdminEmail,
  SUPER_ADMIN_PHONE,
} from "../config/superAdmin.js";
import { maskEmail } from "../utils/mailer.js";
import { isEmail } from "../utils/validate.js";
import User from "../models/User.js";

const router = Router();

// از این پس تنها یک هدف برای کد یک‌بارمصرف داریم: ورود/ثبت‌نام با شماره.
// رمز عبور و «فراموشی رمز» به‌کلی حذف شده‌اند (چه کاربر، چه مدیر).
const LOGIN_PURPOSE = "login";

const requestLimiter = rateLimit({
  name: "otp-request",
  windowMs: 60 * 60 * 1000,
  max: 12,
  message: "درخواست کد تأیید بیش از حد مجاز است. کمی بعد تلاش کنید.",
});

const verifyLimiter = rateLimit({
  name: "otp-verify",
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "تعداد تلاش‌های ناموفق بیش از حد مجاز است. کمی بعد تلاش کنید.",
});

function pickChannel(value) {
  return String(value || "sms").toLowerCase() === "email" ? "email" : "sms";
}

// POST /api/otp/request  { phone?, email?, channel: "sms" | "email" }
// همیشه purpose = login.
//  • اگر شماره همان شمارهٔ مدیر اصلیِ هاردکدشده باشد، کد فقط به همان شماره
//    پیامک می‌شود (ورود مدیر با شماره).
//  • مدیر اصلی می‌تواند با ایمیلِ هاردکدشده هم وارد شود؛ در این حالت کد به همان
//    ایمیل فرستاده می‌شود ولی همچنان به شمارهٔ ثابت مدیر گره می‌خورد.
//  • کانال ایمیل فقط برای کاربری کار می‌کند که قبلاً حساب و شماره دارد؛ کد
//    همیشه به شمارهٔ حساب گره می‌خورد و از راه ایمیل تحویل داده می‌شود.
router.post(
  "/request",
  requestLimiter,
  ah(async (req, res) => {
    const channel = pickChannel(req.body?.channel);
    const email = isEmail(req.body?.email);
    let phone = normalizePhone(req.body?.phone);

    // ---- ورود مدیر اصلی: فقط با شمارهٔ ثابت داخل کد. کانال همیشه پیامک ----
    if (phone && isSuperAdminPhone(phone)) {
      const out = await issueOtp(req, phone, LOGIN_PURPOSE, { channel: "sms" });
      logActivity(req, {
        action: "otp.login.request",
        target: maskPhone(phone),
        success: out.ok,
        status: out.ok ? 200 : out.status,
      });
      if (!out.ok) {
        return res.status(out.status).json({ error: out.error, retryAfter: out.retryAfter });
      }
      return res.json({
        ok: true,
        channel: "sms",
        sentTo: maskPhone(phone),
        expiresIn: out.expiresIn,
        retryAfter: OTP_RESEND_SECONDS,
        devCode: out.devCode,
      });
    }

    // ---- ورود مدیر اصلی با ایمیل هاردکدشده: کد به همان ایمیل فرستاده می‌شود ----
    if (channel === "email" && email && isSuperAdminEmail(email)) {
      const out = await issueOtp(req, SUPER_ADMIN_PHONE, LOGIN_PURPOSE, {
        channel: "email",
        email,
      });
      logActivity(req, {
        action: "otp.login.request",
        target: maskEmail(email),
        success: out.ok,
        status: out.ok ? 200 : out.status,
      });
      if (!out.ok) {
        return res.status(out.status).json({ error: out.error, retryAfter: out.retryAfter });
      }
      return res.json({
        ok: true,
        channel: "email",
        sentTo: maskEmail(email),
        expiresIn: out.expiresIn,
        retryAfter: OTP_RESEND_SECONDS,
        devCode: out.devCode,
      });
    }

    // ---- کانال ایمیل: شماره را از روی حساب کاربر پیدا می‌کنیم ----
    if (channel === "email") {
      if (!email) return res.status(400).json({ error: "ایمیل معتبر وارد کنید." });
      const owner = await User.findOne({ email, deletedAt: null }).select("phone").lean();
      if (!owner?.phone) {
        // Keep the public response indistinguishable from an existing account;
        // otherwise this endpoint becomes an e-mail enumeration oracle.
        logActivity(req, {
          action: "otp.login.request",
          target: maskEmail(email),
          success: true,
          status: 200,
          meta: "generic response for unknown identity",
        });
        return res.json({
          ok: true,
          channel: "email",
          sentTo: maskEmail(email),
          expiresIn: 5 * 60,
          retryAfter: OTP_RESEND_SECONDS,
        });
      }
      phone = owner.phone;
    }

    if (!phone) {
      return res.status(400).json({ error: "شماره موبایل معتبر وارد کنید (مثل 09121234567)." });
    }

    const out = await issueOtp(req, phone, LOGIN_PURPOSE, { channel, email });
    logActivity(req, {
      action: "otp.login.request",
      target: channel === "email" ? maskEmail(email) : maskPhone(phone),
      success: out.ok,
      status: out.ok ? 200 : out.status,
    });
    if (!out.ok) {
      return res.status(out.status).json({ error: out.error, retryAfter: out.retryAfter });
    }
    res.json({
      ok: true,
      channel,
      sentTo: channel === "email" ? maskEmail(email) : maskPhone(phone),
      expiresIn: out.expiresIn,
      retryAfter: OTP_RESEND_SECONDS,
      devCode: out.devCode,
    });
  })
);

// POST /api/otp/verify  { phone?, email?, code } -> { ticket }
// بلیت خروجی در مرحلهٔ بعد به POST /api/auth/login داده می‌شود.
router.post(
  "/verify",
  verifyLimiter,
  ah(async (req, res) => {
    const email = isEmail(req.body?.email);
    let phone = normalizePhone(req.body?.phone);

    // مدیر اصلی با ایمیل هاردکدشده: کد روی شمارهٔ ثابت مدیر گره خورده است.
    if (!phone && email && isSuperAdminEmail(email)) {
      phone = SUPER_ADMIN_PHONE;
    } else if (!phone && email) {
      // اگر کاربر با ایمیل کد گرفته، شماره را از روی حسابش پیدا می‌کنیم.
      const owner = await User.findOne({ email, deletedAt: null }).select("phone").lean();
      phone = owner?.phone || "";
    }
    if (!phone) {
      return res.status(400).json({ error: "درخواست معتبر نیست. شماره یا ایمیل را دوباره وارد کنید." });
    }

    const out = await verifyOtp(phone, LOGIN_PURPOSE, req.body?.code);
    logActivity(req, {
      action: "otp.login.verify",
      target: email ? maskEmail(email) : maskPhone(phone),
      success: out.ok,
      status: out.ok ? 200 : out.status,
    });
    if (!out.ok) return res.status(out.status).json({ error: out.error });
    res.json({ ok: true, ticket: out.ticket });
  })
);

export default router;
