import { Router } from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { issueOtp, verifyOtp, OTP_RESEND_SECONDS } from "../utils/otp.js";
import { logActivity } from "../utils/activityLog.js";
import { normalizePhone, maskPhone } from "../config/superAdmin.js";
import { maskEmail } from "../utils/mailer.js";
import { isEmail } from "../utils/validate.js";
import {
  getLoginMethods,
  loginChannelDisabledMessage,
  loginChannelEnabled,
} from "../utils/loginMethods.js";

const router = Router();
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
// A valid e-mail does not need to belong to an existing account: successful
// verification may create a new e-mail-only customer in POST /api/auth/login.
router.post(
  "/request",
  requestLimiter,
  ah(async (req, res) => {
    const channel = pickChannel(req.body?.channel);
    const email = isEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone);

    // Enforce the owner switch on the API itself, not only in the login UI.
    const loginMethods = await getLoginMethods();
    if (!loginChannelEnabled(loginMethods, channel)) {
      return res.status(403).json({ error: loginChannelDisabledMessage(channel) });
    }
    if (channel === "email" && !email) {
      return res.status(400).json({ error: "ایمیل معتبر وارد کنید." });
    }
    if (channel === "sms" && !phone) {
      return res
        .status(400)
        .json({ error: "شماره موبایل معتبر وارد کنید (مثل 09121234567)." });
    }

    const out = await issueOtp(req, channel === "sms" ? phone : "", LOGIN_PURPOSE, {
      channel,
      email,
    });
    const target = channel === "email" ? maskEmail(email) : maskPhone(phone);
    logActivity(req, {
      action: "otp.login.request",
      target,
      success: out.ok,
      status: out.ok ? 200 : out.status,
    });
    if (!out.ok) {
      return res.status(out.status).json({ error: out.error, retryAfter: out.retryAfter });
    }

    res.json({
      ok: true,
      channel,
      sentTo: target,
      expiresIn: out.expiresIn,
      retryAfter: OTP_RESEND_SECONDS,
      devCode: out.devCode,
    });
  })
);

// POST /api/otp/verify  { phone?, email?, code } -> { ticket }
router.post(
  "/verify",
  verifyLimiter,
  ah(async (req, res) => {
    const email = isEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone);
    if (email && phone) {
      return res.status(400).json({ error: "فقط یکی از ایمیل یا شماره موبایل را وارد کنید." });
    }

    const channel = email ? "email" : "sms";
    if ((channel === "email" && !email) || (channel === "sms" && !phone)) {
      return res.status(400).json({ error: "درخواست ورود معتبر نیست." });
    }

    const loginMethods = await getLoginMethods();
    if (!loginChannelEnabled(loginMethods, channel)) {
      return res.status(403).json({ error: loginChannelDisabledMessage(channel) });
    }

    const out = await verifyOtp(
      channel === "sms" ? phone : "",
      LOGIN_PURPOSE,
      req.body?.code,
      { channel, email }
    );
    logActivity(req, {
      action: "otp.login.verify",
      target: channel === "email" ? maskEmail(email) : maskPhone(phone),
      success: out.ok,
      status: out.ok ? 200 : out.status,
    });
    if (!out.ok) return res.status(out.status).json({ error: out.error });
    res.json({ ok: true, ticket: out.ticket });
  })
);

export default router;
