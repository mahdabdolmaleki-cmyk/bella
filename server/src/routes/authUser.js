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
  SUPER_ADMIN_SESSION_ID,
} from "../config/superAdmin.js";
import { maskEmail } from "../utils/mailer.js";
import {
  getLoginMethods,
  loginChannelDisabledMessage,
  loginChannelEnabled,
} from "../utils/loginMethods.js";
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

export function identityChangeFor(user, fieldInput, valueInput) {
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

  const currentPhone = normalizePhone(user.phone) || "";
  if (!value && !currentPhone) {
    return {
      ok: false,
      status: 400,
      error: "پیش از حذف تنها ایمیل حساب، ابتدا یک شماره موبایل تأییدشده اضافه کنید.",
    };
  }

  // A new e-mail proves itself directly. Removal has no destination and is
  // therefore finalised by the current-identity step (phone when available).
  return {
    ok: true,
    field,
    value,
    purpose: IDENTITY_PURPOSE.email,
    otpPhone: "",
    target: `email:${value}`,
    otpOptions: {
      channel: "email",
      email: value,
      subject,
      target: `email:${value}`,
    },
    sentTo: value ? maskEmail(value) : maskPhone(currentPhone),
  };
}

export function identityOtpStepFor(user, change, stageInput) {
  const stage = stageInput === "destination" ? "destination" : "current";
  if (stage === "destination") {
    if (change.field === "email" && !change.value) {
      return { ok: false, status: 400, error: "حذف ایمیل فقط به تأیید شماره فعلی نیاز دارد." };
    }
    return { ok: true, stage, ...change };
  }

  const currentPhone = normalizePhone(user.phone) || "";
  const currentEmail = isEmail(user.email) || "";
  if (!currentPhone && !currentEmail) {
    return { ok: false, status: 400, error: "شناسه فعلی حساب برای تأیید معتبر نیست." };
  }
  const channel = currentPhone ? "sms" : "email";
  return {
    ok: true,
    stage,
    field: change.field,
    value: change.value,
    purpose: IDENTITY_PURPOSE.current,
    otpPhone: currentPhone,
    otpOptions: {
      channel,
      email: currentEmail,
      subject: String(user._id),
      target: change.target,
    },
    sentTo: channel === "sms" ? maskPhone(currentPhone) : maskEmail(currentEmail),
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

export function initialNameFromEmail(email) {
  const local = String(email || "").split("@", 1)[0] || "";
  const readable = local.replace(/[._+\-]+/g, " ").replace(/\s+/g, " ").trim();
  return readable.slice(0, 80) || "مشتری بلا";
}

function loginUserQuery(UserModel, filter) {
  return UserModel.findOne(filter).select("+tokenVersion");
}

/**
 * Returns the single customer account for a verified login identity, creating
 * it only when no active or legacy soft-deleted row owns that identity.
 *
 * Older deployments could leave a deleted row's phone/e-mail in place while a
 * unique MongoDB index still reserved it. Looking only for `deletedAt: null`
 * then attempted an impossible insert and surfaced the generic duplicate-key
 * error after a correct OTP. A verified owner may safely reactivate that row;
 * tokenVersion is advanced so sessions issued before deletion stay revoked.
 */
export async function findOrCreateVerifiedUser(
  { email = "", phone = "" },
  UserModel = User
) {
  const identity = email ? { email } : { phone };
  const verifiedField = email ? "emailVerified" : "phoneVerified";

  async function activate(user) {
    let changed = false;
    if (user.deletedAt) {
      user.deletedAt = null;
      user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
      changed = true;
    }
    if (!user[verifiedField]) {
      user[verifiedField] = true;
      changed = true;
    }
    if (changed) await user.save();
    return user;
  }

  // Prefer the active account, but also recognise legacy deleted rows that
  // still reserve the unique identity in MongoDB.
  let user = await loginUserQuery(UserModel, { ...identity, deletedAt: null });
  if (user) return activate(user);
  user = await loginUserQuery(UserModel, identity);
  if (user) return activate(user);

  const registration = email
    ? {
        name: initialNameFromEmail(email),
        email,
        emailVerified: true,
      }
    : {
        name: "مشتری بلا",
        phone,
        phoneVerified: true,
      };

  try {
    return await UserModel.create(registration);
  } catch (err) {
    if (err?.code !== 11000) throw err;

    // Close a concurrent first-login/reactivation race. Query by the verified
    // identity itself instead of repeating the active-only lookup.
    user = await loginUserQuery(UserModel, { ...identity, deletedAt: null });
    if (!user) user = await loginUserQuery(UserModel, identity);
    if (!user) throw err;
    return activate(user);
  }
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
// POST /api/auth/login  { phone? , email? , ticket }
// A verified new phone or e-mail creates the customer account automatically.
// No name is requested during sign-up: e-mail accounts use the readable local
// part of the address, while phone accounts start as «مشتری بلا».
// ---------------------------------------------------------------------------
router.post(
  "/login",
  loginLimiter,
  ah(async (req, res) => {
    const ticket = str(req.body?.ticket, { max: 100 });
    const rawEmail = str(req.body?.email, { max: 160 });
    const email = rawEmail ? isEmail(rawEmail) : "";
    const phone = normalizePhone(req.body?.phone);
    if (rawEmail && !email) {
      return res.status(400).json({ error: "ایمیل معتبر وارد کنید." });
    }
    if ((email && phone) || (!email && !phone)) {
      return res.status(400).json({ error: "فقط یک ایمیل یا شماره موبایل معتبر وارد کنید." });
    }

    // Re-check the owner switch when the one-time ticket is consumed. An OTP
    // requested before a method was disabled must not remain a bypass.
    const loginChannel = email ? "email" : "sms";
    const loginMethods = await getLoginMethods();
    if (!loginChannelEnabled(loginMethods, loginChannel)) {
      return res.status(403).json({ error: loginChannelDisabledMessage(loginChannel) });
    }

    const fail = (msg) => {
      penalise(req, "user-login", LOGIN_WINDOW);
      logActivity(req, {
        action: "user.login.failed",
        target: email || phone,
        success: false,
        status: 401,
      });
      return res
        .status(401)
        .json({ error: msg || "کد تأیید معتبر نیست یا منقضی شده است." });
    };

    // Ticket, channel and canonical identity are consumed atomically. A ticket
    // issued for an e-mail can never be replayed as a phone login or vice versa.
    const verifiedIdentity = await consumeTicket(
      loginChannel === "sms" ? phone : "",
      "login",
      ticket,
      { channel: loginChannel, email }
    );
    if (!verifiedIdentity) return fail();

    resetLimit(req, "user-login");

    if ((phone && isSuperAdminPhone(phone)) || (email && isSuperAdminEmail(email))) {
      res.cookie(
        ADMIN_COOKIE,
        signToken(
          {
            role: "admin",
            superAdmin: true,
            adminSessionId: SUPER_ADMIN_SESSION_ID,
          },
          { expiresIn: `${adminSessionHours()}h` }
        ),
        adminCookieOptions()
      );
      logActivity(req, { action: "admin.login", target: "super-admin", status: 200 });
      return res.json({ ok: true, admin: true });
    }

    const user = await findOrCreateVerifiedUser({ email, phone });

    res.cookie(
      USER_COOKIE,
      signToken({ sub: String(user._id), tv: user.tokenVersion ?? 0 }),
      cookieOptions()
    );
    logActivity(req, {
      action: "user.login",
      target: email || phone,
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
    // account's current identifier (phone, or e-mail for e-mail-only accounts).
    // Consuming that ticket here means the destination ticket represents both.
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
          error: "ابتدا کد ارسال‌شده به شناسه فعلی حساب را تأیید کنید.",
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
      const raw = str(req.body.phone, { max: 20 });
      const currentPhone = normalizePhone(user.phone);
      const phone = raw ? normalizePhone(raw) : "";
      if (raw && !phone) {
        return res.status(400).json({ error: "شماره موبایل معتبر وارد کنید (مثل 09121234567)." });
      }
      // Empty is valid for an account that registered by e-mail and has never
      // added a phone. Removing an existing verified phone is a separate flow.
      if (!phone && currentPhone) {
        return res.status(400).json({ error: "شماره تأییدشده را نمی‌توان خالی کرد." });
      }
      if (phone !== currentPhone) {
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
        user.emailVerified = Boolean(identityChange.value);
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
