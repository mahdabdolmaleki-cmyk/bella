import crypto from "crypto";
import Otp, { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "../models/Otp.js";
import { sendSms, otpMessage } from "./sms.js";
import { sendMail, otpMail } from "./mailer.js";
import { clientIp } from "./activityLog.js";
import { normalizePhone } from "../config/superAdmin.js";

// A new code can only be requested once every 60 seconds per identity+purpose.
export const OTP_RESEND_SECONDS = 60;
// Max codes per identity+purpose per hour (anti SMS-bombing / cost abuse).
const OTP_HOURLY_MAX = 5;
// A verified OTP only authorises its final action for this long.
const OTP_TICKET_TTL_MS = 10 * 60 * 1000;

function sixDigits() {
  // crypto.randomInt is unbiased and unpredictable (Math.random is neither).
  return String(crypto.randomInt(100000, 1000000));
}

function subjectOf(value) {
  if (value === undefined || value === null || typeof value === "object") return "";
  return String(value).trim().slice(0, 64);
}

function emailOf(value) {
  if (value === undefined || value === null || typeof value === "object") return "";
  return String(value).trim().toLowerCase().slice(0, 160);
}

function targetOf(value) {
  if (value === undefined || value === null || typeof value === "object") return "";
  return String(value).trim().toLowerCase().slice(0, 220);
}

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/;

function otpIdentity(phone, options = {}) {
  const channel = options.channel === "email" ? "email" : "sms";
  if (channel === "email") {
    const email = emailOf(options.email);
    return EMAIL_RE.test(email) ? `email:${email}` : "";
  }
  return phone ? `phone:${phone}` : "";
}

function scopedFilter(phone, purpose, options = {}) {
  const filter = { identity: otpIdentity(phone, options), purpose };
  if (options.channel === "email" || options.channel === "sms") {
    filter.channel = options.channel;
  }
  const subject = subjectOf(options.subject);
  if (subject) filter.subject = subject;
  const target = targetOf(options.target);
  if (target) filter.target = target;
  if (
    purpose === "change-email" &&
    Object.prototype.hasOwnProperty.call(options, "email")
  ) {
    filter.email = emailOf(options.email);
  }
  return filter;
}

function ticketDigest(ticket) {
  // Tickets contain 256 random bits, so a deterministic SHA-256 digest is safe
  // to query and does not permit a practical offline search if MongoDB leaks.
  return crypto.createHash("sha256").update(ticket, "utf8").digest("hex");
}

/**
 * Creates and sends a one-time code, by SMS or by e-mail.
 *
 * OTPs are keyed by a canonical `phone:...` or `email:...` identity. This lets
 * a verified e-mail create an account before the customer has added a phone.
 * `subject` binds sensitive profile OTPs to one user and `target` binds them to
 * the exact proposed action.
 *
 * @param {object} options { channel?: "sms" | "email", email?: string, subject?: string, target?: string }
 * @returns {Promise<{ok: true, expiresIn: number, channel: string, devCode?: string} | {ok: false, status: number, error: string, retryAfter?: number}>}
 */
export async function issueOtp(req, phoneInput, purpose, options = {}) {
  const phone = normalizePhone(phoneInput) || "";
  const channel = options.channel === "email" ? "email" : "sms";
  const email = emailOf(options.email);
  if (channel === "email" && !EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "ایمیل معتبر وارد کنید." };
  }
  if (channel === "sms" && !phone) {
    return { ok: false, status: 400, error: "شماره موبایل معتبر وارد کنید (مثل 09121234567)." };
  }

  const identity = otpIdentity(phone, { channel, email });
  if (!identity) {
    return { ok: false, status: 400, error: "شناسه دریافت کد معتبر نیست." };
  }

  // Issuing a fresh code invalidates every older code for this identity/purpose,
  // even if the user changed the proposed e-mail between requests.
  const scope = scopedFilter(phone, purpose, {
    channel,
    email,
    subject: options.subject,
  });
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await Otp.find({ ...scope, createdAt: { $gte: hourAgo } })
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

  // Any previous unused code in the same scope is invalidated.
  await Otp.deleteMany({ ...scope, consumedAt: null });

  const code = sixDigits();
  const doc = new Otp({
    phone,
    identity,
    purpose,
    subject: subjectOf(options.subject),
    target: targetOf(options.target),
    ip: clientIp(req),
    channel,
    email,
  });
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
 * Both failed-attempt increments and the successful claim are conditional
 * MongoDB updates, so concurrent requests cannot bypass the attempt limit or
 * turn one code into multiple tickets.
 */
export async function verifyOtp(phoneInput, purpose, codeInput, options = {}) {
  const phone = normalizePhone(phoneInput) || "";
  const code = String(codeInput ?? "").replace(/[^0-9]/g, "");
  const identity = otpIdentity(phone, options);
  if (!identity || code.length !== 6) {
    return { ok: false, status: 400, error: "کد تأیید ۶ رقمی را وارد کنید." };
  }

  const scope = scopedFilter(phone, purpose, options);
  const createdAfter = new Date(Date.now() - OTP_TTL_SECONDS * 1000);
  const doc = await Otp.findOne({ ...scope, consumedAt: null }).sort({ createdAt: -1 });
  if (!doc || doc.isExpired()) {
    return { ok: false, status: 400, error: "کد تأیید منقضی شده است. کد تازه بگیرید." };
  }
  if (doc.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: "تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد تازه بگیرید." };
  }

  const match = await doc.checkCode(code);
  if (!match) {
    const updated = await Otp.findOneAndUpdate(
      {
        _id: doc._id,
        consumedAt: null,
        attempts: { $lt: OTP_MAX_ATTEMPTS },
        createdAt: { $gte: createdAfter },
      },
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (!updated) {
      return { ok: false, status: 400, error: "کد تأیید دیگر معتبر نیست. کد تازه بگیرید." };
    }
    const left = Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts);
    return {
      ok: false,
      status: 400,
      error: `کد تأیید نادرست است. ${left} تلاش باقی مانده است.`,
    };
  }

  const ticket = crypto.randomBytes(32).toString("hex");
  const consumedAt = new Date();
  const claimed = await Otp.findOneAndUpdate(
    {
      _id: doc._id,
      consumedAt: null,
      attempts: { $lt: OTP_MAX_ATTEMPTS },
      createdAt: { $gte: createdAfter },
    },
    {
      $set: {
        ticketDigest: ticketDigest(ticket),
        consumedAt,
        ticketExpiresAt: new Date(consumedAt.getTime() + OTP_TICKET_TTL_MS),
      },
    },
    { new: true }
  );
  if (!claimed) {
    return { ok: false, status: 400, error: "کد تأیید قبلاً استفاده شده یا منقضی شده است." };
  }

  return { ok: true, identity, phone, ticket };
}

/**
 * Atomically consumes the ticket produced by verifyOtp.
 *
 * The digest is queryable, so validation and deletion happen in one
 * findOneAndDelete operation. At most one concurrent caller can receive the
 * successful result. Optional scope fields bind profile tickets to their user
 * and exact destination.
 */
export async function consumeTicket(phoneInput, purpose, ticketInput, options = {}) {
  const phone = normalizePhone(phoneInput) || "";
  const identity = otpIdentity(phone, options);
  const ticket = String(ticketInput ?? "");
  if (!identity || !/^[0-9a-f]{64}$/.test(ticket)) return null;

  const now = new Date();
  const doc = await Otp.findOneAndDelete({
    ...scopedFilter(phone, purpose, options),
    ticketDigest: ticketDigest(ticket),
    consumedAt: { $ne: null },
    ticketExpiresAt: { $gt: now },
  });

  return doc ? identity : null;
}
