import { Router } from "express";
import User from "../models/User.js";
import Order from "../models/Order.js";
import { requireUser } from "../middleware/authMiddleware.js";
import { rateLimit, penalise, resetLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import { str, isEmail, isPostalCode, addressIssue } from "../utils/validate.js";
import { isProvince } from "../utils/shipping.js";
import {
  consumeTicket,
  issueOtp,
  verifyOtp,
  OTP_RESEND_SECONDS,
} from "../utils/otp.js";
import {
  normalizePhone,
  isSuperAdminPhone,
  isSuperAdminEmail,
  maskPhone,
  SUPER_ADMIN_PHONE,
} from "../config/superAdmin.js";
import { maskEmail } from "../utils/mailer.js";
import {
  USER_COOKIE,
  ADMIN_COOKIE,
  signToken,
  cookieOptions,
  adminCookieOptions,
  adminSessionHours,
  clearCookieOptions,
} from "../utils/auth.js";

const router = Router();

const LOGIN_WINDOW = 15 * 60 * 1000;
const loginLimiter = rateLimit({
  name: "user-login",
  windowMs: LOGIN_WINDOW,
  max: 20,
  message: "تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
});

const identityOtpRequestLimiter = rateLimit({
  name: "identity-otp-request",
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "درخواست کد تغییر اطلاعات بیش از حد مجاز است. کمی بعد تلاش کنید.",
});

const identityOtpVerifyLimiter = rateLimit({
  name: "identity-otp-verify",
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "تعداد تلاش‌های تأیید بیش از حد مجاز است. کمی بعد تلاش کنید.",
});

const IDENTITY_PURPOSE = Object.freeze({
  current: "confirm-identity",
  phone: "change-phone",
  email: "change-email",
});

function identityChangeFor(user, fieldInput, valueInput) {
  const field = fieldInput === "phone" || fieldInput === "email" ? fieldInput : "";
  if (!field) {
    return { ok: false, status: 400, error: "نوع شناسه باید phone یا email باشد." };
  }

  const subject = String(user._id);
  if (field === "phone") {
    const value = normalizePhone(valueInput);
    if (!value) {
      return {
        ok: false,
        status: 400,
        error: "شماره موبایل معتبر وارد کنید (مثل 09121234567).",
      };
    }
    if (value === user.phone) {
      return { ok: false, status: 400, error: "شماره جدید با شماره فعلی یکسان است." };
    }
    if (isSuperAdminPhone(value)) {
      return { ok: false, status: 400, error: "این شماره قابل استفاده نیست." };
    }
    return {
      ok: true,
      field,
      value,
      purpose: IDENTITY_PURPOSE.phone,
      otpPhone: value,
      target: `phone:${value}`,
      otpOptions: { channel: "sms", subject, target: `phone:${value}` },
      sentTo: maskPhone(value),
    };
  }

  const raw = str(valueInput, { max: 160 });
  const value = raw ? isEmail(raw) : "";
  if (raw && !value) {
    return { ok: false, status: 400, error: "ایمیل معتبر وارد کنید." };
  }
  if (value === (user.email || "")) {
    return { ok: false, status: 400, error: "ایمیل جدید با ایمیل فعلی یکسان است." };
  }
  if (value && isSuperAdminEmail(value)) {
    return { ok: false, status: 400, error: "این ایمیل قابل استفاده نیست." };
  }

  const currentPhone = normalizePhone(user.phone);
  if (!currentPhone) {
    return { ok: false, status: 400, error: "شماره فعلی حساب برای تأیید معتبر نیست." };
  }

  // A new e-mail proves itself. Removing an existing e-mail has no destination,
  // so that operation is confirmed by an OTP sent to the verified current phone.
  const channel = value ? "email" : "sms";
  return {
    ok: true,
    field,
    value,
    purpose: IDENTITY_PURPOSE.email,
    otpPhone: currentPhone,
    target: `email:${value}`,
    otpOptions: { channel, email: value, subject, target: `email:${value}` },
    sentTo: value ? maskEmail(value) : maskPhone(currentPhone),
  };
}

function identityOtpStepFor(user, change, stageInput) {
  const stage = stageInput === "destination" ? "destination" : "current";
  if (stage === "destination") {
    if (change.field === "email" && !change.value) {
      return { ok: false, status: 400, error: "حذف ایمیل فقط به تأیید شماره فعلی نیاز دارد." };
    }
    return { ok: true, stage, ...change };
  }

  const currentPhone = normalizePhone(user.phone);
  if (!currentPhone) {
    return { ok: false, status: 400, error: "شماره فعلی حساب برای تأیید معتبر نیست." };
  }
  return {
    ok: true,
    stage,
    field: change.field,
    value: change.value,
    purpose: IDENTITY_PURPOSE.current,
    otpPhone: currentPhone,
    otpOptions: {
      channel: "sms",
      subject: String(user._id),
      target: change.target,
    },
    sentTo: maskPhone(currentPhone),
  };
}

async function identityIsTaken(change, userId) {
  if (!change.value) return false;
  return Boolean(
    await User.exists({
      [change.field]: change.value,
      deletedAt: null,
      _id: { $ne: userId },
    })
  );
}

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email || "",
    phone: user.phone || "",
    address: user.address || "",
    province: user.province || "",
    city: user.city || "",
    postalCode: user.postalCode || "",
    favorites: Array.isArray(user.favorites) ? user.favorites : [],
  };
}

// ---------------------------------------------------------------------------
// POST /api/auth/login  { phone? , email? , ticket , name? }
// تنها راه ورود: کد یک‌بارمصرف. رمز عبور به‌کلی حذف شده است.
//  • اگر شماره همان شمارهٔ مدیر اصلیِ هاردکدشده باشد ← نشست مدیر ساخته می‌شود
//    و { admin: true } برمی‌گردد تا فرانت به /admin برود.
//  • در غیر این صورت، حساب مشتری پیدا یا ساخته می‌شود و نشست کاربر ست می‌شود.
// ---------------------------------------------------------------------------
router.post(
  "/login",
  loginLimiter,
  ah(async (req, res) => {
    const ticket = str(req.body?.ticket, { max: 100 });
    const email = isEmail(req.body?.email);
    const name = str(req.body?.name, { max: 80 });
    let phone = normalizePhone(req.body?.phone);

    // مدیر اصلی با ایمیل هاردکدشده وارد می‌شود؛ در غیر این صورت شماره را از روی حساب پیدا می‌کنیم.
    if (!phone && email && isSuperAdminEmail(email)) {
      phone = SUPER_ADMIN_PHONE;
    } else if (!phone && email) {
      const owner = await User.findOne({ email, deletedAt: null }).select("phone").lean();
      phone = owner?.phone || "";
    }

    const fail = (msg) => {
      penalise(req, "user-login", LOGIN_WINDOW);
      logActivity(req, {
        action: "user.login.failed",
        target: email || phone || "",
        success: false,
        status: 401,
      });
      return res
        .status(401)
        .json({ error: msg || "کد تأیید معتبر نیست یا منقضی شده است." });
    };

    if (!phone) {
      return res.status(400).json({ error: "شماره موبایل یا ایمیل معتبر وارد کنید." });
    }

    // بلیت اثبات می‌کند که کد پیامک‌شده به این شماره درست وارد شده است.
    const verifiedPhone = await consumeTicket(phone, "login", ticket);
    if (!verifiedPhone) return fail();

    resetLimit(req, "user-login");

    // ---- ورود مدیر اصلی (فقط شمارهٔ هاردکدشده) ----
    if (isSuperAdminPhone(phone)) {
      res.cookie(
        ADMIN_COOKIE,
        signToken({ role: "admin", superAdmin: true }, { expiresIn: `${adminSessionHours()}h` }),
        adminCookieOptions()
      );
      logActivity(req, { action: "admin.login", target: "super-admin", status: 200 });
      return res.json({ ok: true, admin: true });
    }

    // ---- ورود/ثبت‌نام مشتری (پیدا یا ساخت) ----
    let user = await User.findOne({ phone, deletedAt: null }).select("+tokenVersion");
    if (!user) {
      try {
        user = await User.create({
          name: name || "مشتری بلّا",
          phone,
          phoneVerified: true,
        });
      } catch (err) {
        // The partial unique phone index closes the concurrent first-login race.
        // If another request created the row first, continue with that account.
        if (err?.code !== 11000) throw err;
        user = await User.findOne({ phone, deletedAt: null }).select("+tokenVersion");
        if (!user) throw err;
      }
    } else {
      let dirty = false;
      if (!user.phoneVerified) {
        user.phoneVerified = true;
        dirty = true;
      }
      // اگر کاربر هنگام ورودِ اول نامی وارد کرده و هنوز نام واقعی ندارد، ذخیره کن.
      if (name && (!user.name || user.name === "مشتری بلّا")) {
        user.name = name;
        dirty = true;
      }
      if (dirty) await user.save();
    }

    res.cookie(
      USER_COOKIE,
      signToken({ sub: String(user._id), tv: user.tokenVersion ?? 0 }),
      cookieOptions()
    );
    logActivity(req, {
      action: "user.login",
      target: user.phone,
      status: 200,
      actor: { actorType: "user", actorId: String(user._id), actorLabel: user.name },
    });
    res.json({ user: publicUser(user) });
  })
);

router.post("/logout", (req, res) => {
  logActivity(req, { action: "user.logout", status: 200 });
  res.clearCookie(USER_COOKIE, clearCookieOptions());
  res.json({ ok: true });
});

router.get("/me", requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Request an OTP for exactly one new login identifier. The OTP is bound to the
// authenticated user id and the normalised destination, so another account or
// another phone/e-mail cannot reuse the resulting ticket.
router.post(
  "/me/identity/request-otp",
  requireUser,
  identityOtpRequestLimiter,
  ah(async (req, res) => {
    const change = identityChangeFor(req.user, req.body?.field, req.body?.value);
    if (!change.ok) return res.status(change.status).json({ error: change.error });

    if (await identityIsTaken(change, req.user._id)) {
      return res.status(409).json({
        error:
          change.field === "phone"
            ? "این شماره قبلاً استفاده شده است."
            : "این ایمیل قبلاً استفاده شده است.",
      });
    }

    const step = identityOtpStepFor(req.user, change, req.body?.stage);
    if (!step.ok) return res.status(step.status).json({ error: step.error });

    // Before sending a code to the proposed destination, prove control of the
    // account's existing verified phone. Consuming this ticket here means the
    // destination ticket issued later represents both checks.
    if (step.stage === "destination") {
      const currentStep = identityOtpStepFor(req.user, change, "current");
      const currentTicket = str(req.body?.currentTicket, { max: 100 });
      const currentVerified = await consumeTicket(
        currentStep.otpPhone,
        currentStep.purpose,
        currentTicket,
        currentStep.otpOptions
      );
      if (!currentVerified) {
        return res.status(403).json({
          error: "ابتدا کد ارسال‌شده به شماره فعلی حساب را تأیید کنید.",
        });
      }
    }

    const out = await issueOtp(req, step.otpPhone, step.purpose, step.otpOptions);
    logActivity(req, {
      action: `identity.${change.field}.otp.${step.stage}.request`,
      target: step.sentTo,
      success: out.ok,
      status: out.ok ? 200 : out.status,
    });
    if (!out.ok) {
      return res.status(out.status).json({ error: out.error, retryAfter: out.retryAfter });
    }

    res.json({
      ok: true,
      field: change.field,
      stage: step.stage,
      channel: out.channel,
      sentTo: step.sentTo,
      expiresIn: out.expiresIn,
      retryAfter: OTP_RESEND_SECONDS,
      devCode: out.devCode,
    });
  })
);

router.post(
  "/me/identity/verify-otp",
  requireUser,
  identityOtpVerifyLimiter,
  ah(async (req, res) => {
    const change = identityChangeFor(req.user, req.body?.field, req.body?.value);
    if (!change.ok) return res.status(change.status).json({ error: change.error });

    if (await identityIsTaken(change, req.user._id)) {
      return res.status(409).json({
        error: change.field === "phone" ? "این شماره قبلاً استفاده شده است." : "این ایمیل قبلاً استفاده شده است.",
      });
    }

    const step = identityOtpStepFor(req.user, change, req.body?.stage);
    if (!step.ok) return res.status(step.status).json({ error: step.error });

    const out = await verifyOtp(
      step.otpPhone,
      step.purpose,
      req.body?.code,
      step.otpOptions
    );
    logActivity(req, {
      action: `identity.${change.field}.otp.${step.stage}.verify`,
      target: step.sentTo,
      success: out.ok,
      status: out.ok ? 200 : out.status,
    });
    if (!out.ok) return res.status(out.status).json({ error: out.error });

    res.json({ ok: true, field: change.field, stage: step.stage, ticket: out.ticket });
  })
);

// PATCH /api/auth/me — ordinary profile fields save directly; changing one
// login identifier additionally requires the destination-bound OTP ticket.
router.patch(
  "/me",
  requireUser,
  rateLimit({ name: "profile-update", windowMs: 60 * 1000, max: 20 }),
  ah(async (req, res) => {
    const user = req.user;

    if (req.body?.name !== undefined) {
      const name = str(req.body.name, { max: 80 });
      if (!name) return res.status(400).json({ error: "نام نمی‌تواند خالی باشد." });
      user.name = name;
    }

    const identityChanges = [];

    if (req.body?.email !== undefined) {
      const raw = str(req.body.email, { max: 160 });
      const email = raw ? isEmail(raw) : "";
      if (raw && !email) return res.status(400).json({ error: "ایمیل معتبر وارد کنید." });
      if (email !== (user.email || "")) {
        const change = identityChangeFor(user, "email", email);
        if (!change.ok) return res.status(change.status).json({ error: change.error });
        identityChanges.push(change);
      }
    }

    if (req.body?.phone !== undefined) {
      const phone = normalizePhone(str(req.body.phone, { max: 20 }));
      if (!phone) {
        return res.status(400).json({ error: "شماره موبایل معتبر وارد کنید (مثل 09121234567)." });
      }
      if (phone !== user.phone) {
        const change = identityChangeFor(user, "phone", phone);
        if (!change.ok) return res.status(change.status).json({ error: change.error });
        identityChanges.push(change);
      }
    }

    if (identityChanges.length > 1) {
      return res.status(400).json({
        error: "شماره و ایمیل را جداگانه تغییر دهید تا هر مقصد مستقل تأیید شود.",
      });
    }
    const identityChange = identityChanges[0] || null;
    if (identityChange && (await identityIsTaken(identityChange, user._id))) {
      return res.status(409).json({
        error:
          identityChange.field === "phone"
            ? "این شماره قبلاً استفاده شده است."
            : "این ایمیل قبلاً استفاده شده است.",
      });
    }

    if (req.body?.address !== undefined) {
      const raw = str(req.body.address, { max: 500 });
      if (!raw) {
        user.address = "";
      } else {
        const issue = addressIssue(raw);
        if (issue) return res.status(400).json({ error: issue });
        user.address = raw;
      }
    }
    if (req.body?.province !== undefined) {
      const province = str(req.body.province, { max: 40 });
      if (province && !isProvince(province)) {
        return res.status(400).json({ error: "استان انتخاب‌شده معتبر نیست." });
      }
      user.province = province;
    }
    if (req.body?.city !== undefined) {
      user.city = str(req.body.city, { max: 60 });
    }
    if (req.body?.postalCode !== undefined) {
      const raw = str(req.body.postalCode, { max: 20 });
      if (!raw) {
        user.postalCode = "";
      } else {
        const postalCode = isPostalCode(raw);
        if (!postalCode) {
          return res.status(400).json({ error: "کد پستی باید ۱۰ رقم معتبر باشد." });
        }
        user.postalCode = postalCode;
      }
    }

    if (identityChange) {
      const isEmailRemoval = identityChange.field === "email" && !identityChange.value;
      const proofStep = identityOtpStepFor(
        user,
        identityChange,
        isEmailRemoval ? "current" : "destination"
      );
      const ticketField = isEmailRemoval
        ? "currentIdentityTicket"
        : identityChange.field === "phone"
          ? "phoneTicket"
          : "emailTicket";
      const ticket = str(req.body?.[ticketField], { max: 100 });
      const verified = await consumeTicket(
        proofStep.otpPhone,
        proofStep.purpose,
        ticket,
        proofStep.otpOptions
      );
      if (!verified) {
        return res.status(403).json({
          error: isEmailRemoval
            ? "برای حذف ایمیل، کد ارسال‌شده به شماره فعلی را تأیید کنید."
            : "برای تغییر شناسه، کد مقصد جدید را تأیید کنید یا دوباره کد بگیرید.",
        });
      }

      if (identityChange.field === "phone") {
        user.phone = identityChange.value;
        user.phoneVerified = true;
      } else {
        user.email = identityChange.value || undefined;
      }
      // Revoke every older session, then replace this browser's cookie below.
      user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
    }

    try {
      await user.save();
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ error: "این ایمیل یا شماره قبلاً استفاده شده است." });
      }
      throw err;
    }

    if (identityChange) {
      res.cookie(
        USER_COOKIE,
        signToken({ sub: String(user._id), tv: user.tokenVersion }),
        cookieOptions()
      );
      logActivity(req, {
        action: `identity.${identityChange.field}.change`,
        target: identityChange.sentTo,
        status: 200,
      });
    }
    res.json({ user: publicUser(user) });
  })
);

router.get(
  "/orders",
  requireUser,
  ah(async (req, res) => {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ orders: orders.map((o) => o.toDTO()) });
  })
);

export default router;
