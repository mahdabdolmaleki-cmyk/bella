import { Router } from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { issueOtp, verifyOtp, OTP_RESEND_SECONDS } from "../utils/otp.js";
import { OTP_TTL_SECONDS } from "../models/Otp.js";
import { logActivity } from "../utils/activityLog.js";
import { normalizePhone, isSuperAdminPhone, maskPhone, SUPER_ADMIN_PHONE } from "../config/superAdmin.js";
import { maskEmail } from "../utils/mailer.js";
import { isEmail } from "../utils/validate.js";
import User from "../models/User.js";

const router = Router();
const PUBLIC_PURPOSES = new Set(["register", "reset"]);

const requestLimiter = rateLimit({
  name: "otp-request",
  windowMs: 60 * 60 * 1000,
  max: 12, // per IP per hour, on top of the per-phone limits
  message: "درخواست کد تأیید بیش از حد مجاز است. کمی بعد تلاش کنید.",
});

const verifyLimiter = rateLimit({
  name: "otp-verify",
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "تعداد تلاش‌های ناموفق بیش از حد مجاز است.",
});

// The delivery channel is chosen by the visitor: SMS or e-mail.
function pickChannel(value) {
  return String(value || "sms").toLowerCase() === "email" ? "email" : "sms";
}

// POST /api/otp/request
// { phone?, email?, channel: "sms" | "email", purpose: "register" | "reset" | "admin-reset" }
router.post(
  "/request",
  requestLimiter,
  ah(async (req, res) => {
    const purpose = String(req.body?.purpose || "register");
    const channel = pickChannel(req.body?.channel);
    const email = isEmail(req.body?.email);
    let phone = normalizePhone(req.body?.phone);

    if (purpose === "admin-reset") {
      // The root-admin code can ONLY go to the hard-coded number, whatever the
      // client sends. No enumeration, no redirection, no override, no e-mail.
      if (!SUPER_ADMIN_PHONE) {
        return res.status(503).json({ error: "بازیابی مدیر اصلی غیرفعال است." });
      }
      const out = await issueOtp(req, SUPER_ADMIN_PHONE, "admin-reset", { channel: "sms" });
      logActivity(req, {
        action: "otp.admin-reset.request",
        target: maskPhone(SUPER_ADMIN_PHONE),
        success: out.ok,
        status: out.ok ? 200 : out.status,
      });
      if (!out.ok) return res.status(out.status).json({ error: out.error });
      return res.json({
        ok: true,
        channel: "sms",
        sentTo: maskPhone(SUPER_ADMIN_PHONE),
        expiresIn: out.expiresIn,
        retryAfter: OTP_RESEND_SECONDS,
        devCode: out.devCode,
      });
    }

    if (!PUBLIC_PURPOSES.has(purpose)) {
      return res.status(400).json({ error: "نوع درخواست معتبر نیست." });
    }
    if (channel === "email" && !email) {
      return res.status(400).json({ error: "ایمیل معتبر وارد کنید." });
    }

    const emailReceipt = {
      ok: true,
      channel,
      sentTo: channel === "email" ? maskEmail(email) : "",
      expiresIn: OTP_TTL_SECONDS,
      retryAfter: OTP_RESEND_SECONDS,
    };

    // Password reset by e-mail: the account is resolved from its address, so the
    // visitor never has to remember which number they signed up with. As with
    // the SMS flow we never reveal whether the address exists.
    if (purpose === "reset" && channel === "email") {
      const owner = await User.findOne({ email, deletedAt: null }).select("phone").lean();
      if (!owner?.phone) return res.json(emailReceipt);
      phone = owner.phone;
    }

    if (!phone) {
      return res.status(400).json({ error: "شماره موبایل معتبر وارد کنید (مثل 09121234567)." });
    }
    if (isSuperAdminPhone(phone)) {
      // The root number can never be used for a customer account.
      return res.status(400).json({ error: "این شماره قابل استفاده نیست." });
    }

    const exists = await User.exists({ phone, deletedAt: null });
    if (purpose === "register") {
      if (exists) {
        return res.status(409).json({ error: "این شماره قبلاً ثبت‌نام کرده است. وارد شوید." });
      }
      if (channel === "email" && (await User.exists({ email, deletedAt: null }))) {
        return res.status(409).json({ error: "این ایمیل قبلاً ثبت‌نام کرده است. وارد شوید." });
      }
    }
    // For "reset" we deliberately do NOT reveal whether the account exists;
    // an unknown number/address simply never receives a code.
    if (purpose === "reset" && !exists) {
      return res.json({
        ...emailReceipt,
        sentTo: channel === "email" ? maskEmail(email) : maskPhone(phone),
      });
    }

    const out = await issueOtp(req, phone, purpose, { channel, email });
    logActivity(req, {
      action: `otp.${purpose}.request`,
      target: channel === "email" ? maskEmail(email) : maskPhone(phone),
      success: out.ok,
      status: out.ok ? 200 : out.status,
    });
    if (!out.ok) {
      return res
        .status(out.status)
        .json({ error: out.error, retryAfter: out.retryAfter });
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

// POST /api/otp/verify  { phone?, email?, purpose, code } -> { ticket }
router.post(
  "/verify",
  verifyLimiter,
  ah(async (req, res) => {
    const purpose = String(req.body?.purpose || "register");
    const email = isEmail(req.body?.email);
    let phone =
      purpose === "admin-reset" ? SUPER_ADMIN_PHONE : normalizePhone(req.body?.phone);

    // E-mail flow: the code was bound to the account's phone number, so resolve
    // it here instead of exposing the number to the browser.
    if (!phone && email && PUBLIC_PURPOSES.has(purpose)) {
      const owner = await User.findOne({ email, deletedAt: null }).select("phone").lean();
      phone = owner?.phone || "";
    }

    if (!phone || (!PUBLIC_PURPOSES.has(purpose) && purpose !== "admin-reset")) {
      return res.status(400).json({ error: "درخواست معتبر نیست." });
    }

    const out = await verifyOtp(phone, purpose, req.body?.code);
    logActivity(req, {
      action: `otp.${purpose}.verify`,
      target: email ? maskEmail(email) : maskPhone(phone),
      success: out.ok,
      status: out.ok ? 200 : out.status,
    });
    if (!out.ok) return res.status(out.status).json({ error: out.error });
    res.json({ ok: true, ticket: out.ticket });
  })
);

export default router;
