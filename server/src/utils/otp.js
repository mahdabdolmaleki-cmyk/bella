import crypto from "crypto";
import bcrypt from "bcryptjs";
import Otp, { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "../models/Otp.js";
import { sendSms, otpMessage } from "./sms.js";
import { sendMail, otpMail } from "./mailer.js";
import { clientIp } from "./activityLog.js";
import { normalizePhone } from "../config/superAdmin.js";

// A new code can only be requested once every 60 seconds per phone+purpose.
export const OTP_RESEND_SECONDS = 60;
// Max codes per phone+purpose per hour (anti SMS-bombing / cost abuse).
const OTP_HOURLY_MAX = 5;

function sixDigits() {
  // crypto.randomInt is unbiased and unpredictable (Math.random is neither).
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Creates and sends a one-time code, by SMS or by e-mail.
 *
 * The code is always bound to the account's phone number, whatever the
 * delivery channel is, so every downstream step (register / reset) keeps using
 * one single identity. `options.channel` only decides HOW the code travels.
 *
 * @param {object} options { channel?: "sms" | "email", email?: string }
 * @returns {Promise<{ok: true, expiresIn: number, channel: string, devCode?: string} | {ok: false, status: number, error: string, retryAfter?: number}>}
 */
export async function issueOtp(req, phoneInput, purpose, options = {}) {
  const phone = normalizePhone(phoneInput);
  if (!phone) {
    return { ok: false, status: 400, error: "شماره موبایل معتبر وارد کنید (مثل 09121234567)." };
  }

  const channel = options.channel === "email" ? "email" : "sms";
  const email =
    channel === "email" ? String(options.email || "").trim().toLowerCase() : "";
  if (channel === "email" && !/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) {
    return { ok: false, status: 400, error: "ایمیل معتبر وارد کنید." };
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await Otp.find({ phone, purpose, createdAt: { $gte: hourAgo } })
    .sort({ createdAt: -1 })
    .limit(OTP_HOURLY_MAX)
    .lean();

  if (recent.length > 0) {
    const ageMs = Date.now() - new Date(recent[0].createdAt).getTime();
    if (ageMs < OTP_RESEND_SECONDS * 1000) {
      const retryAfter = Math.ceil((OTP_RESEND_SECONDS * 1000 - ageMs) / 1000);
      return {
        ok: false,
        status: 429,
        retryAfter,
        error: `لطفاً ${retryAfter} ثانیه دیگر دوباره تلاش کنید.`,
      };
    }
    if (recent.length >= OTP_HOURLY_MAX) {
      return {
        ok: false,
        status: 429,
        error: "تعداد درخواست کد تأیید بیش از حد مجاز است. یک ساعت دیگر تلاش کنید.",
      };
    }
  }

  // Any previous unused code for this phone+purpose is invalidated.
  await Otp.deleteMany({ phone, purpose, consumedAt: null });

  const code = sixDigits();
  const doc = new Otp({ phone, purpose, ip: clientIp(req), channel, email });
  await doc.setCode(code);
  await doc.save();

  let delivered = false;
  if (channel === "email") {
    const mail = otpMail(code);
    delivered = await sendMail(email, mail.subject, mail.text, mail.html);
  } else {
    delivered = await sendSms(phone, otpMessage(code));
  }

  if (!delivered) {
    await Otp.deleteOne({ _id: doc._id }).catch(() => {});
    return {
      ok: false,
      status: 502,
      error:
        channel === "email"
          ? "ارسال ایمیل ناموفق بود. کمی بعد دوباره تلاش کنید یا پیامک را انتخاب کنید."
          : "ارسال پیامک ناموفق بود. کمی بعد دوباره تلاش کنید یا ایمیل را انتخاب کنید.",
    };
  }

  const result = { ok: true, expiresIn: OTP_TTL_SECONDS, channel };
  // Only outside production, and only while the channel has no real provider,
  // so the flow stays testable without an SMS/mail vendor.
  const provider =
    channel === "email"
      ? (process.env.MAIL_PROVIDER || "console").toLowerCase()
      : (process.env.SMS_PROVIDER || "console").toLowerCase();
  if (process.env.NODE_ENV !== "production" && provider === "console") {
    result.devCode = code;
  }
  return result;
}

/**
 * Verifies a code and returns a one-time ticket used by the final step.
 */
export async function verifyOtp(phoneInput, purpose, codeInput) {
  const phone = normalizePhone(phoneInput);
  const code = String(codeInput ?? "").replace(/[^0-9]/g, "");
  if (!phone || code.length !== 6) {
    return { ok: false, status: 400, error: "کد تأیید ۶ رقمی را وارد کنید." };
  }

  const doc = await Otp.findOne({ phone, purpose, consumedAt: null }).sort({ createdAt: -1 });
  if (!doc || doc.isExpired()) {
    return { ok: false, status: 400, error: "کد تأیید منقضی شده است. کد تازه بگیرید." };
  }
  if (doc.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: "تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد تازه بگیرید." };
  }

  const match = await doc.checkCode(code);
  if (!match) {
    doc.attempts += 1;
    await doc.save().catch(() => {});
    const left = Math.max(0, OTP_MAX_ATTEMPTS - doc.attempts);
    return {
      ok: false,
      status: 400,
      error: `کد تأیید نادرست است. ${left} تلاش باقی مانده است.`,
    };
  }

  const ticket = crypto.randomBytes(32).toString("hex");
  doc.ticketHash = await bcrypt.hash(ticket, 10);
  doc.consumedAt = new Date();
  await doc.save();
  return { ok: true, phone, ticket };
}

/**
 * Consumes the ticket produced by verifyOtp. Single-use: the record is deleted.
 */
export async function consumeTicket(phoneInput, purpose, ticketInput) {
  const phone = normalizePhone(phoneInput);
  const ticket = String(ticketInput ?? "");
  if (!phone || ticket.length !== 64) return null;

  const doc = await Otp.findOne({ phone, purpose, ticketHash: { $ne: null } }).sort({
    consumedAt: -1,
  });
  if (!doc || !doc.consumedAt) return null;
  // The ticket is only valid for 10 minutes after the code was verified.
  if (Date.now() - new Date(doc.consumedAt).getTime() > 10 * 60 * 1000) return null;

  const match = await bcrypt.compare(ticket, doc.ticketHash);
  if (!match) return null;

  await Otp.deleteOne({ _id: doc._id }).catch(() => {});
  return phone;
}
