import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Order from "../models/Order.js";
import { requireUser } from "../middleware/authMiddleware.js";
import { rateLimit, penalise, resetLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLog.js";
import {
  str,
  isEmail,
  isPhone,
  isPostalCode,
  passwordIssue,
  addressIssue,
} from "../utils/validate.js";
import { isProvince } from "../utils/shipping.js";
import { consumeTicket } from "../utils/otp.js";
import { normalizePhone, isSuperAdminPhone } from "../config/superAdmin.js";
import {
  USER_COOKIE,
  signToken,
  cookieOptions,
  clearCookieOptions,
} from "../utils/auth.js";

const router = Router();
const BCRYPT_ROUNDS = 12; // was 10 — 12 is the current sane default

const LOGIN_WINDOW = 15 * 60 * 1000;
const loginLimiter = rateLimit({
  name: "user-login",
  windowMs: LOGIN_WINDOW,
  max: 10,
  message: "تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
});
const registerLimiter = rateLimit({
  name: "user-register",
  windowMs: 60 * 60 * 1000,
  max: 5, // 5 new accounts per hour per IP
  message: "تعداد ثبت‌نام بیش از حد مجاز است. بعداً تلاش کنید.",
});

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    address: user.address || "",
    // These three were missing, so a saved destination never reached the
    // browser after login and the buyer had to retype it at every checkout.
    province: user.province || "",
    city: user.city || "",
    postalCode: user.postalCode || "",
  };
}

router.post(
  "/register",
  registerLimiter,
  ah(async (req, res) => {
    const name = str(req.body?.name, { max: 80 });
    const email = isEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone);
    const ticket = str(req.body?.ticket, { max: 100 });
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name) return res.status(400).json({ error: "نام الزامی است." });
    if (!email) return res.status(400).json({ error: "ایمیل معتبر وارد کنید." });
    if (!phone) {
      return res.status(400).json({ error: "شماره موبایل معتبر وارد کنید." });
    }
    if (isSuperAdminPhone(phone)) {
      return res.status(400).json({ error: "این شماره قابل استفاده نیست." });
    }
    const pwIssue = passwordIssue(password);
    if (pwIssue) return res.status(400).json({ error: pwIssue });

    // The phone must have been verified by OTP in the previous step.
    const verifiedPhone = await consumeTicket(phone, "register", ticket);
    if (!verifiedPhone) {
      return res.status(400).json({
        error: "ابتدا شماره موبایل خود را با کد پیامکی تأیید کنید.",
      });
    }

    const exists = await User.findOne({ $or: [{ email }, { phone }], deletedAt: null }).lean();
    if (exists) {
      return res.status(409).json({ error: "این ایمیل یا شماره قبلاً ثبت شده است." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let user;
    try {
      user = await User.create({ name, email, phone, phoneVerified: true, passwordHash });
    } catch (err) {
      // Duplicate-key race between the check above and the insert.
      if (err?.code === 11000) {
        return res.status(409).json({ error: "این ایمیل قبلاً ثبت شده است." });
      }
      throw err;
    }

    res.cookie(
      USER_COOKIE,
      signToken({ sub: String(user._id), tv: user.tokenVersion ?? 0 }),
      cookieOptions()
    );
    logActivity(req, {
      action: "user.register",
      target: email,
      status: 201,
      actor: { actorType: "user", actorId: String(user._id), actorLabel: `${name} <${email}>` },
    });
    res.status(201).json({ user: publicUser(user) });
  })
);

router.post(
  "/login",
  loginLimiter,
  ah(async (req, res) => {
    const email = isEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone ?? req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    // Always the same message + always run a bcrypt compare, so an attacker can
    // neither enumerate accounts nor time-probe which emails exist.
    const fail = () => {
      penalise(req, "user-login", LOGIN_WINDOW);
      logActivity(req, {
        action: "user.login.failed",
        target: email || "",
        success: false,
        status: 401,
        actor: { actorType: "guest", actorId: "", actorLabel: email || "ناشناس" },
      });
      return res.status(401).json({ error: "ایمیل یا رمز عبور نادرست است." });
    };
    if ((!email && !phone) || !password || password.length > 128) return fail();

    const user = await User.findOne({
      ...(email ? { email } : { phone }),
      deletedAt: null,
    }).select("+passwordHash +tokenVersion");
    const hash = user?.passwordHash || "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduO";
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) return fail();

    resetLimit(req, "user-login");
    res.cookie(
      USER_COOKIE,
      signToken({ sub: String(user._id), tv: user.tokenVersion ?? 0 }),
      cookieOptions()
    );
    logActivity(req, {
      action: "user.login",
      target: user.email,
      status: 200,
      actor: { actorType: "user", actorId: String(user._id), actorLabel: `${user.name} <${user.email}>` },
    });
    res.json({ user: publicUser(user) });
  })
);

router.post("/logout", (req, res) => {
  logActivity(req, { action: "user.logout", status: 200 });
  res.clearCookie(USER_COOKIE, clearCookieOptions());
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password  { phone, ticket, password }
// The ticket proves that an OTP sent to this phone was entered correctly.
// ---------------------------------------------------------------------------
router.post(
  "/reset-password",
  rateLimit({ name: "password-reset", windowMs: 60 * 60 * 1000, max: 10 }),
  ah(async (req, res) => {
    let phone = normalizePhone(req.body?.phone);
    const emailInput = isEmail(req.body?.email);
    // The OTP is always bound to the account phone, but a visitor who used
    // the e-mail channel only knows their address — resolve it server-side.
    if (!phone && emailInput) {
      const owner = await User.findOne({ email: emailInput, deletedAt: null })
        .select("phone")
        .lean();
      phone = owner?.phone || "";
    }
    const ticket = str(req.body?.ticket, { max: 100 });
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!phone) return res.status(400).json({ error: "شماره موبایل یا ایمیل معتبر نیست." });
    const pwIssue = passwordIssue(password);
    if (pwIssue) return res.status(400).json({ error: pwIssue });

    const verifiedPhone = await consumeTicket(phone, "reset", ticket);
    if (!verifiedPhone) {
      return res.status(400).json({ error: "کد تأیید معتبر نیست یا منقضی شده است." });
    }

    const user = await User.findOne({ phone, deletedAt: null }).select("+passwordHash +tokenVersion");
    if (!user) {
      return res.status(404).json({ error: "حسابی با این شماره پیدا نشد." });
    }

    user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.phoneVerified = true;
    // SECURITY: clearing the cookie only logged the CURRENT browser out; JWTs
    // already issued to other devices stayed valid until they expired. Bumping
    // tokenVersion invalidates every existing session for this account.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    res.clearCookie(USER_COOKIE, clearCookieOptions());
    logActivity(req, {
      action: "user.password.reset",
      target: user.email,
      status: 200,
      actor: { actorType: "user", actorId: String(user._id), actorLabel: user.email },
    });
    res.json({ ok: true });
  })
);

router.get("/me", requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

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
    if (req.body?.phone !== undefined) {
      const raw = str(req.body.phone, { max: 20 });
      const phone = normalizePhone(raw);
      if (raw && !phone && !isPhone(raw)) {
        return res.status(400).json({ error: "شماره تماس معتبر نیست." });
      }
      if (phone && phone !== user.phone) {
        if (isSuperAdminPhone(phone)) {
          return res.status(400).json({ error: "این شماره قابل استفاده نیست." });
        }
        // Changing the phone invalidates its verified status.
        user.phoneVerified = false;
      }
      user.phone = phone || raw;
    }
    if (req.body?.address !== undefined) {
      const raw = str(req.body.address, { max: 500 });
      // Empty clears the saved address; anything else must be a usable one.
      // Without this the profile accepted values checkout would later reject.
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
      // Empty clears the saved destination; anything else must be a real province
      // or shipping quotes built from it would silently fail later.
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
    // NOTE: email and passwordHash are deliberately NOT updatable here — mass
    // assignment of those fields would allow account takeover.
    await user.save();
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
